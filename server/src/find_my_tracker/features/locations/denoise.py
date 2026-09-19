"""
Separating a beacon's real path from the noise in its reports. Pure functions; nothing is stored.

A report's position is the *finder's* position: some iPhone that heard the beacon over Bluetooth.
Its accuracy byte is that iPhone's own GPS estimate, and research (Heinrich et al., "Who Can Find
My Devices?", PoPETs 2021, Table 6) found it pessimistic for stationary finders and badly
optimistic for moving ones (±145 m claimed, 581 m actual, in a car). The confidence byte is not
authenticated and takes undocumented values. So neither field decides alone: a report is judged
by whether the reports around it agree.

- **Spike**: far from the reports before and after it, while those two agree with each other.
  A passing car's iPhone produces exactly this, parked or driving: a real move doesn't snap back.
- **Too fast**: reaching it from the last good report needs an impossible speed. Catches spikes
  at the start or end of a range, where there is no report on the other side.
- **Imprecise**: a saturated or very poor accuracy byte, *and* it disagrees with its neighbours.

Good reports that stay together become **stays**: one entry instead of dozens of scattered dots.
"""

from __future__ import annotations

import statistics
from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass
from enum import StrEnum

from find_my_tracker.features.locations.geo import haversine_m

SPIKE_M = 100  # further than this from both neighbours, which agree, is a spike
NEIGHBOUR_WINDOW_S = 30 * 60  # neighbours further apart in time than this say nothing
MAX_SPEED_MPS = 70  # ~250 km/h; faster needs a plane, and planes produce no reports
POOR_ACCURACY_M = 150
STAY_RADIUS_M = 100  # finders scatter ~100 m around a parked beacon
STAY_MAX_GAP_S = 2 * 60 * 60  # no reports for longer than this ends a stay: we don't know
STAY_MIN_S = 10 * 60
STAY_MIN_POINTS = 3


class Noise(StrEnum):
    SPIKE = "spike"
    TOO_FAST = "too_fast"
    IMPRECISE = "imprecise"


@dataclass(frozen=True)
class Sample:
    observed_at: int  # epoch seconds
    latitude: float
    longitude: float
    accuracy_m: int | None


@dataclass(frozen=True)
class Stay:
    first: int  # index of the first sample
    last: int  # index of the last sample, inclusive
    latitude: float
    longitude: float
    count: int  # good samples in it


def _dist(a: Sample, b: Sample) -> float:
    return haversine_m(a.latitude, a.longitude, b.latitude, b.longitude)


def classify(samples: Sequence[Sample]) -> list[Noise | None]:
    """One verdict per sample (None = good). `samples` must be one beacon's, sorted by time."""
    verdicts: list[Noise | None] = [None] * len(samples)

    # Spikes and imprecise points: judged against the nearest neighbours on either side.
    # Two passes, so a spike next to a spike is judged against good points the second time.
    for _ in range(2):
        good = [i for i, v in enumerate(verdicts) if v is None]
        for pos, i in enumerate(good):
            if pos == 0 or pos == len(good) - 1:
                continue
            prev, cur, nxt = samples[good[pos - 1]], samples[i], samples[good[pos + 1]]
            if (
                cur.observed_at - prev.observed_at > NEIGHBOUR_WINDOW_S
                or nxt.observed_at - cur.observed_at > NEIGHBOUR_WINDOW_S
            ):
                continue
            d_prev, d_next, d_pn = _dist(prev, cur), _dist(cur, nxt), _dist(prev, nxt)
            near = min(d_prev, d_next)
            if near > SPIKE_M and d_pn < near / 2:
                verdicts[i] = Noise.SPIKE
            elif (cur.accuracy_m or 0) >= POOR_ACCURACY_M and near > SPIKE_M / 2 and d_pn < near:
                verdicts[i] = Noise.IMPRECISE

    # Speed, against the last good sample. Only condemns a point its successor doesn't back up:
    # a real long jump (a flight, a gap in coverage) is followed by more reports over there.
    last: Sample | None = None
    for i, cur in enumerate(samples):
        if verdicts[i] is not None:
            continue
        if last is not None:
            dt = max(cur.observed_at - last.observed_at, 1)
            d = _dist(last, cur)
            if (
                d > SPIKE_M
                and d / dt > MAX_SPEED_MPS
                and not _confirmed(samples, verdicts, i, last)
            ):
                verdicts[i] = Noise.TOO_FAST
                continue
        last = cur
    return verdicts


def _confirmed(
    samples: Sequence[Sample], verdicts: Sequence[Noise | None], i: int, before: Sample
) -> bool:
    """Whether the next good sample backs up sample i: it's nearer i than where we were before.

    Not "within SPIKE_M of i": after a flight the beacon is often still moving (a taxi from the
    airport), so the next report is far from i, but much further from the departure airport.
    """
    cur = samples[i]
    for j in range(i + 1, len(samples)):
        nxt = samples[j]
        if nxt.observed_at - cur.observed_at > NEIGHBOUR_WINDOW_S:
            return False
        if verdicts[j] is None:
            return _dist(cur, nxt) < _dist(before, nxt) / 2
    return False


def stays(samples: Sequence[Sample], verdicts: Sequence[Noise | None]) -> list[Stay]:
    """Runs of good samples that stayed within STAY_RADIUS_M for at least STAY_MIN_S."""
    good = [i for i, v in enumerate(verdicts) if v is None]
    found: list[Stay] = []
    run: list[int] = []

    def close() -> None:
        if len(run) >= STAY_MIN_POINTS:
            first, last = samples[run[0]], samples[run[-1]]
            if last.observed_at - first.observed_at >= STAY_MIN_S:
                lat, lon = centre([samples[i] for i in run])
                found.append(Stay(run[0], run[-1], lat, lon, len(run)))

    for i in good:
        if run:
            lat, lon = centre([samples[j] for j in run])
            s = samples[i]
            gap = s.observed_at - samples[run[-1]].observed_at
            if (
                gap > STAY_MAX_GAP_S
                or haversine_m(lat, lon, s.latitude, s.longitude) > STAY_RADIUS_M
            ):
                close()
                run = []
        run.append(i)
    close()
    return found


def centre(group: Sequence[Sample]) -> tuple[float, float]:
    """Where a stationary beacon most likely is.

    A position reported more than once, to the last digit, is one finder that stayed next to
    the beacon: no two independent fixes agree to 1 cm. Prefer it. Otherwise the median, which
    one stray report can't drag.
    """
    counts = Counter((s.latitude, s.longitude) for s in group)
    (lat, lon), n = counts.most_common(1)[0]
    if n >= 2:
        return lat, lon
    return (
        statistics.median(s.latitude for s in group),
        statistics.median(s.longitude for s in group),
    )
