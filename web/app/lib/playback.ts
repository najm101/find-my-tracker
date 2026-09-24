/**
 * History playback: each item's journey through a range, and a clock that plays it back.
 *
 * Reports come irregularly: minutes apart on the move, hours apart while an item sits still or is
 * near its owner (Apple stops reporting it then). Played at one constant speed, most of a
 * playback would show nothing moving. So the clock plays movement at a rate that fits all of it
 * into about half a minute, and fast-forwards each quiet stretch in a moment.
 */

import type { Schemas } from "~/lib/api/client"
import { type LngLat, measure, pointAlong, slice, upTo } from "~/lib/geometry"
import type { RoadTrip } from "~/lib/road-routes"

type Point = Schemas["LocationPoint"]
type Stay = Schemas["Stay"]

export type { LngLat }

/** Longer than this between two reports, and the line says nothing about how it was travelled. */
export const GAP_MS = 30 * 60_000

/** At 1×, all the movement in a range plays in about this long… */
const MOVING_MS = 30_000
/** …but never slower than this many times real time, so a short trip doesn't crawl. */
const MIN_RATE = 20
/** How long one quiet stretch takes at 1×… */
const QUIET_MS = 1_500
/** …unless there are many: together they never take longer than this. */
const QUIET_BUDGET_MS = 15_000

export type Track = {
  beaconId: number
  /** Good reports, oldest first. */
  points: Point[]
  /** Their times, epoch ms. */
  times: number[]
  /**
   * Where the marker goes at each report: the report itself, or the centre of the stay it is
   * part of, so the marker sits still there instead of jittering between reports.
   */
  coords: LngLat[]
  /** Per segment (report i to i + 1): spent inside one stay. */
  still: boolean[]
  /**
   * Per segment: the way along the roads from report i to i + 1, when a road route says so;
   * null for a straight line.
   */
  legs: (LngLat[] | null)[]
}

/**
 * One track per beacon, from the good reports only (noisy ones are skipped). With road `routes`,
 * the marker goes along them: each routed report sits on its route, and moves along the roads to
 * the next one.
 */
export function buildTracks(
  points: Point[],
  stays: Stay[],
  routes: RoadTrip[] = []
): Track[] {
  const byBeacon = new Map<number, Point[]>()
  for (const p of points) {
    if (p.noise) continue
    const list = byBeacon.get(p.beacon_id)
    if (list) list.push(p)
    else byBeacon.set(p.beacon_id, [p])
  }
  const staysByBeacon = new Map<number, Stay[]>()
  for (const s of stays) {
    const list = staysByBeacon.get(s.beacon_id)
    if (list) list.push(s)
    else staysByBeacon.set(s.beacon_id, [s])
  }

  const tracks: Track[] = []
  for (const [beaconId, list] of byBeacon) {
    const reports = list
      .map((p) => ({ p, t: Date.parse(p.observed_at) }))
      .sort((a, b) => a.t - b.t)
    const own = (staysByBeacon.get(beaconId) ?? [])
      .map((s) => ({
        s,
        from: Date.parse(s.arrived_at),
        to: Date.parse(s.left_at),
      }))
      .sort((a, b) => a.from - b.from)

    // Both are sorted, so one pass pairs each report with the stay it falls in.
    const stayOf: number[] = []
    let k = 0
    for (const { t } of reports) {
      while (k < own.length && own[k].to < t) k++
      stayOf.push(k < own.length && own[k].from <= t ? k : -1)
    }

    tracks.push({
      beaconId,
      points: reports.map((r) => r.p),
      times: reports.map((r) => r.t),
      coords: reports.map(({ p }, i) => {
        const stay = own[stayOf[i]]?.s
        return stay
          ? [stay.longitude, stay.latitude]
          : [p.longitude, p.latitude]
      }),
      still: stayOf
        .slice(0, -1)
        .map((stay, i) => stay >= 0 && stay === stayOf[i + 1]),
      legs: reports.slice(0, -1).map(() => null),
    })
  }
  for (const route of routes) {
    const track = tracks.find((t) => t.beaconId === route.beacon_id)
    if (track) followRoute(track, route)
  }
  return tracks
}

/** Put the track's reports on a trip's route, and the legs between them along it. */
function followRoute(track: Track, route: RoadTrip) {
  if (route.fallback || route.geometry.length < 2) return
  const line = route.geometry as LngLat[]
  const along = measure(line)
  const index = new Map(track.times.map((t, i) => [t, i]))
  const at = route.reports.map((r) => index.get(Date.parse(r.observed_at)))
  const broken = new Set(route.broken_after)
  route.reports.forEach((r, k) => {
    const i = at[k]
    if (i !== undefined) track.coords[i] = [r.longitude, r.latitude]
  })
  for (let k = 0; k + 1 < route.reports.length; k++) {
    const i = at[k]
    if (i === undefined || at[k + 1] !== i + 1 || broken.has(k)) continue
    track.legs[i] = slice(
      line,
      along,
      route.reports[k].offset_m,
      route.reports[k + 1].offset_m
    )
  }
}

export type QuietKind = "stay" | "gap" | "idle"

/** A stretch the clock fast-forwards: nothing reported moving. */
export type Quiet = { from: number; to: number; kind: QuietKind }

/** A stretch of report time and the part of the playback it takes. */
type Piece = { from: number; to: number; wallFrom: number; wallTo: number }

export type Clock = {
  /** The first and last report, epoch ms. */
  start: number
  end: number
  /** Every report time, ascending, each once. */
  reports: number[]
  /** The stretches fast-forwarded, ascending. */
  quiet: Quiet[]
  /** How long the whole playback takes at 1×, ms. Zero when there is nothing to play. */
  duration: number
  pieces: Piece[]
}

export function buildClock(tracks: Track[]): Clock {
  const reports = [...new Set(tracks.flatMap((t) => t.times))].sort(
    (a, b) => a - b
  )
  const start = reports[0] ?? 0
  const end = reports[reports.length - 1] ?? 0
  if (reports.length < 2)
    return { start, end, reports, quiet: [], duration: 0, pieces: [] }

  // Something is moving between two reports close enough together, outside a stay.
  const moving: [number, number][] = []
  for (const track of tracks) {
    for (let i = 0; i + 1 < track.times.length; i++) {
      const a = track.times[i]
      const b = track.times[i + 1]
      if (b > a && b - a <= GAP_MS && !track.still[i]) moving.push([a, b])
    }
  }
  const active = union(moving)
  const activeMs = active.reduce((sum, [a, b]) => sum + b - a, 0)
  const rate = Math.max(activeMs / MOVING_MS, MIN_RATE)

  // Everything between is quiet.
  const stretches: { from: number; to: number; active: boolean }[] = []
  let cursor = start
  for (const [a, b] of active) {
    if (a > cursor) stretches.push({ from: cursor, to: a, active: false })
    stretches.push({ from: a, to: b, active: true })
    cursor = b
  }
  if (cursor < end) stretches.push({ from: cursor, to: end, active: false })

  const long = stretches.filter(
    (s) => !s.active && (s.to - s.from) / rate > QUIET_MS
  ).length
  const quietMs = long ? Math.min(QUIET_MS, QUIET_BUDGET_MS / long) : QUIET_MS

  const pieces: Piece[] = []
  const quiet: Quiet[] = []
  let wall = 0
  for (const s of stretches) {
    const natural = (s.to - s.from) / rate
    const length = s.active ? natural : Math.min(natural, quietMs)
    pieces.push({
      from: s.from,
      to: s.to,
      wallFrom: wall,
      wallTo: wall + length,
    })
    wall += length
    if (!s.active && natural > quietMs)
      quiet.push({ from: s.from, to: s.to, kind: quietKind(tracks, s) })
  }
  return { start, end, reports, quiet, duration: wall, pieces }
}

/** Overlapping or touching intervals merged, ascending. */
function union(intervals: [number, number][]): [number, number][] {
  const sorted = [...intervals].sort((x, y) => x[0] - y[0])
  const out: [number, number][] = []
  for (const [a, b] of sorted) {
    const last = out[out.length - 1]
    if (last && a <= last[1]) last[1] = Math.max(last[1], b)
    else out.push([a, b])
  }
  return out
}

/** Why one item was quiet: it stayed put, or went unreported. Several items: just "idle". */
function quietKind(
  tracks: Track[],
  stretch: { from: number; to: number }
): QuietKind {
  if (tracks.length !== 1) return "idle"
  const { times, still } = tracks[0]
  let stay = false
  let gap = false
  for (
    let i = countUpTo(times, stretch.from) - 1;
    i >= 0 && i + 1 < times.length && times[i + 1] <= stretch.to;
    i++
  ) {
    if (still[i]) stay = true
    else gap = true
  }
  if (stay === gap) return "idle"
  return stay ? "stay" : "gap"
}

/** How many of the ascending `values` are at or before `value`. */
function countUpTo(values: readonly number[], value: number): number {
  let low = 0
  let high = values.length
  while (low < high) {
    const mid = (low + high) >> 1
    if (values[mid] <= value) low = mid + 1
    else high = mid
  }
  return low
}

/** The piece holding `value`, found by one of its edges (ascending). */
function pieceAt(pieces: Piece[], edge: (p: Piece) => number, value: number) {
  let low = 0
  let high = pieces.length
  while (low < high) {
    const mid = (low + high) >> 1
    if (edge(pieces[mid]) <= value) low = mid + 1
    else high = mid
  }
  return pieces[Math.max(0, low - 1)]
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

/** How far into the playback (ms at 1×) report time `at` is. */
export function wallAt(clock: Clock, at: number): number {
  if (clock.pieces.length === 0) return 0
  const t = clamp(at, clock.start, clock.end)
  const piece = pieceAt(clock.pieces, (p) => p.from, t)
  const span = piece.to - piece.from
  return (
    piece.wallFrom +
    (span ? ((t - piece.from) / span) * (piece.wallTo - piece.wallFrom) : 0)
  )
}

/** The report time `wall` ms (at 1×) into the playback. */
export function timeAt(clock: Clock, wall: number): number {
  if (clock.pieces.length === 0) return clock.start
  if (wall >= clock.duration) return clock.end
  const w = Math.max(0, wall)
  const piece = pieceAt(clock.pieces, (p) => p.wallFrom, w)
  const length = piece.wallTo - piece.wallFrom
  return (
    piece.from +
    (length ? ((w - piece.wallFrom) / length) * (piece.to - piece.from) : 0)
  )
}

/** Where playback gets to from `at` after `wallMs` of playing at 1×. */
export function advance(clock: Clock, at: number, wallMs: number): number {
  return timeAt(clock, wallAt(clock, at) + wallMs)
}

/** The quiet stretch being fast-forwarded at `at`, if any. */
export function quietAt(clock: Clock, at: number): Quiet | undefined {
  let low = 0
  let high = clock.quiet.length
  while (low < high) {
    const mid = (low + high) >> 1
    if (clock.quiet[mid].from <= at) low = mid + 1
    else high = mid
  }
  const stretch = clock.quiet[low - 1]
  return stretch && at < stretch.to ? stretch : undefined
}

/** How many reports have been passed at `at`. */
export function reportsPassed(clock: Clock, at: number): number {
  return countUpTo(clock.reports, at)
}

/** The next report after `at` (1), or the last one before it (-1). */
export function stepReport(clock: Clock, at: number, direction: -1 | 1) {
  if (direction === 1)
    return clock.reports[countUpTo(clock.reports, at)] ?? clock.end
  let i = countUpTo(clock.reports, at) - 1
  while (i >= 0 && clock.reports[i] >= at) i--
  return clock.reports[i] ?? clock.start
}

/** Index of the last report at or before `at`; -1 before the first. */
export function reportIndexAt(track: Track, at: number): number {
  return countUpTo(track.times, at) - 1
}

/**
 * Where the marker is at `at`: on the straight line between the reports either side, as the
 * path draws it. Null before the first report; after the last it stays there.
 */
export function positionAt(track: Track, at: number): LngLat | null {
  const i = reportIndexAt(track, at)
  if (i < 0) return null
  if (i >= track.times.length - 1) return track.coords[track.coords.length - 1]
  const f = (at - track.times[i]) / (track.times[i + 1] - track.times[i])
  const road = track.legs[i]
  if (road) return pointAlong(road, measure(road), f)
  const [x1, y1] = track.coords[i]
  const [x2, y2] = track.coords[i + 1]
  return [x1 + (x2 - x1) * f, y1 + (y2 - y1) * f]
}

/** Lines travelled: runs of movement, and the straight jumps across gaps in the reports. */
export type Lines = { moving: LngLat[][]; gaps: LngLat[][] }

/** The path from the first report up to report `index`, along the roads where known. */
export function travelled(track: Track, index: number): Lines {
  const moving: LngLat[][] = []
  const gaps: LngLat[][] = []
  let run: LngLat[] | null = null
  for (let i = 0; i < index && i + 1 < track.times.length; i++) {
    const a = track.coords[i]
    const b = track.coords[i + 1]
    if (track.times[i + 1] - track.times[i] > GAP_MS) {
      gaps.push([a, b])
      run = null
      continue
    }
    if (!run) {
      run = [a]
      moving.push(run)
    }
    const road = track.legs[i]
    if (road) run.push(...road.slice(1))
    else run.push(b)
  }
  return { moving, gaps }
}

/** The stretch from the last report passed to where the marker is now, if it is between two. */
export function leg(
  track: Track,
  at: number
): { line: LngLat[]; gap: boolean } | null {
  const i = reportIndexAt(track, at)
  const head = positionAt(track, at)
  if (i < 0 || i >= track.times.length - 1 || !head) return null
  const road = track.legs[i]
  const f = (at - track.times[i]) / (track.times[i + 1] - track.times[i])
  return {
    line: road
      ? [...upTo(road, measure(road), f), head]
      : [track.coords[i], head],
    gap: track.times[i + 1] - track.times[i] > GAP_MS,
  }
}
