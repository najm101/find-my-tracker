import math

from find_my_tracker.features.locations.denoise import Noise, Sample, centre, classify, stays

LAT, LON = 52.0, 5.0
M_PER_DEG_LAT = 111_320


def at(t_min: float, north_m: float = 0, east_m: float = 0, acc: int = 50) -> Sample:
    lat = LAT + north_m / M_PER_DEG_LAT
    lon = LON + east_m / (M_PER_DEG_LAT * math.cos(math.radians(LAT)))
    return Sample(int(t_min * 60), lat, lon, acc)


def test_a_passing_finder_is_a_spike() -> None:
    # Parked, with ~40 m of finder scatter, and one report 450 m away for a moment.
    samples = [at(0), at(1, 30), at(2, -20, 10), at(3, 450, 100), at(4, 10, -25), at(5, 5)]
    assert classify(samples) == [None, None, None, Noise.SPIKE, None, None]


def test_driving_is_not_noise() -> None:
    # 15 m/s along a road, a report a minute: every one is far from the last, none is a spike.
    samples = [at(t, east_m=900 * t) for t in range(10)]
    assert classify(samples) == [None] * 10


def test_a_poor_report_that_disagrees_is_imprecise() -> None:
    samples = [at(0), at(1, 10), at(2, 90, acc=200), at(3, -10), at(4)]
    assert classify(samples)[2] is Noise.IMPRECISE


def test_a_poor_report_that_agrees_is_kept() -> None:
    samples = [at(0, acc=200), at(1, 10, acc=190), at(2, -15, acc=220), at(3, acc=200)]
    assert classify(samples) == [None] * 4


def test_an_impossible_last_report_is_too_fast() -> None:
    samples = [at(0), at(1, 10), at(2, 5), at(2.1, 5_000)]
    assert classify(samples)[-1] is Noise.TOO_FAST


def test_a_flight_is_a_real_jump() -> None:
    # 1,800 km in 4 hours, then a taxi out of the airport: far from each other, further from home.
    samples = [at(0), at(1, 10), at(240, 1_800_000), at(241, 1_800_600), at(242, 1_801_200)]
    assert classify(samples) == [None] * 5


def test_reports_that_stay_together_are_one_stay() -> None:
    samples = [at(t, 30 * math.sin(t), 30 * math.cos(t)) for t in range(0, 60, 3)]
    found = stays(samples, classify(samples))
    assert len(found) == 1
    assert (found[0].first, found[0].last, found[0].count) == (0, len(samples) - 1, len(samples))


def test_a_long_silence_ends_a_stay() -> None:
    samples = [at(0), at(5), at(10), at(15), at(15 + 6 * 60), at(20 + 6 * 60), at(30 + 6 * 60)]
    assert [(s.first, s.last) for s in stays(samples, classify(samples))] == [(0, 3), (4, 6)]


def test_moving_is_not_a_stay() -> None:
    samples = [at(t, east_m=300 * t) for t in range(20)]
    assert stays(samples, classify(samples)) == []


def test_centre_prefers_a_finder_that_stayed() -> None:
    repeated = at(3, 40, 40)
    group = [
        at(0),
        at(1, 10),
        repeated,
        at(4, -10),
        Sample(300, repeated.latitude, repeated.longitude, 90),
    ]
    assert centre(group) == (repeated.latitude, repeated.longitude)


def test_centre_is_the_median_otherwise() -> None:
    group = [at(0, 0), at(1, 10), at(2, 20), at(3, 5_000)]
    lat, _ = centre(group)
    assert abs((lat - LAT) * M_PER_DEG_LAT - 15) < 1
