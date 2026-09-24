import { describe, expect, it } from "vitest"

import type { Schemas } from "~/lib/api/client"

import {
  GAP_MS,
  advance,
  buildClock,
  buildTracks,
  leg,
  positionAt,
  quietAt,
  reportsPassed,
  stepReport,
  timeAt,
  travelled,
  wallAt,
} from "./playback"

type Point = Schemas["LocationPoint"]
type Stay = Schemas["Stay"]

const T0 = Date.parse("2026-09-20T08:00:00Z")
const MIN = 60_000
const at = (minutes: number) => new Date(T0 + minutes * MIN).toISOString()

function report(
  minutes: number,
  longitude: number,
  extra: Partial<Point> = {}
): Point {
  return {
    beacon_id: 1,
    observed_at: at(minutes),
    latitude: 52,
    longitude,
    accuracy_m: 10,
    noise: null,
    ...extra,
  }
}

function stay(from: number, to: number, longitude: number, beacon = 1): Stay {
  return {
    beacon_id: beacon,
    arrived_at: at(from),
    left_at: at(to),
    latitude: 52,
    longitude,
    point_count: 3,
  }
}

describe("buildTracks", () => {
  it("groups good reports per beacon, oldest first", () => {
    const tracks = buildTracks(
      [
        report(10, 1),
        report(0, 0),
        report(5, 9, { noise: "spike" }),
        report(3, 5, { beacon_id: 2 }),
      ],
      []
    )
    expect(tracks.map((t) => t.beaconId)).toEqual([1, 2])
    expect(tracks[0].times).toEqual([T0, T0 + 10 * MIN])
    expect(tracks[0].coords).toEqual([
      [0, 52],
      [1, 52],
    ])
  })

  it("pins reports inside a stay to its centre", () => {
    const [track] = buildTracks(
      [report(0, 0), report(10, 1.001), report(20, 0.999), report(30, 3)],
      [stay(10, 20, 1)]
    )
    expect(track.coords.map((c) => c[0])).toEqual([0, 1, 1, 3])
    expect(track.still).toEqual([false, true, false])
  })
})

describe("buildClock", () => {
  it("plays movement in about half a minute", () => {
    const clock = buildClock(
      buildTracks([report(0, 0), report(10, 1), report(20, 2)], [])
    )
    expect(clock.start).toBe(T0)
    expect(clock.end).toBe(T0 + 20 * MIN)
    expect(clock.duration).toBeCloseTo(30_000)
    expect(clock.quiet).toEqual([])
  })

  it("never plays slower than 20 times real time", () => {
    const clock = buildClock(buildTracks([report(0, 0), report(1, 1)], []))
    expect(clock.duration).toBeCloseTo(MIN / 20)
  })

  it("fast-forwards a gap in the reports", () => {
    const clock = buildClock(
      buildTracks(
        [report(0, 0), report(10, 1), report(190, 2), report(200, 3)],
        []
      )
    )
    expect(clock.quiet).toEqual([
      { from: T0 + 10 * MIN, to: T0 + 190 * MIN, kind: "gap" },
    ])
    expect(clock.duration).toBeCloseTo(30_000 + 1_500)
  })

  it("fast-forwards a stay", () => {
    const clock = buildClock(
      buildTracks(
        [
          report(0, 0),
          report(10, 1),
          report(60, 1),
          report(120, 1),
          report(130, 2),
        ],
        [stay(10, 120, 1)]
      )
    )
    expect(clock.quiet).toEqual([
      { from: T0 + 10 * MIN, to: T0 + 120 * MIN, kind: "stay" },
    ])
  })

  it("is quiet only while every item is", () => {
    const clock = buildClock(
      buildTracks(
        [
          report(0, 0),
          report(10, 1),
          report(300, 2),
          report(100, 5, { beacon_id: 2 }),
          report(110, 6, { beacon_id: 2 }),
        ],
        []
      )
    )
    expect(clock.quiet.map((q) => [q.from, q.to, q.kind])).toEqual([
      [T0 + 10 * MIN, T0 + 100 * MIN, "idle"],
      [T0 + 110 * MIN, T0 + 300 * MIN, "idle"],
    ])
  })

  it("keeps many quiet stretches within a budget", () => {
    const points: Point[] = []
    for (let i = 0; i < 40; i++) {
      points.push(report(i * 120, i), report(i * 120 + 10, i + 0.5))
    }
    const clock = buildClock(buildTracks(points, []))
    const quietWall = clock.duration - 30_000
    expect(clock.quiet).toHaveLength(39)
    expect(quietWall).toBeCloseTo(15_000)
  })

  it("has nothing to play with fewer than two reports", () => {
    expect(buildClock(buildTracks([report(0, 0)], [])).duration).toBe(0)
    expect(buildClock([]).duration).toBe(0)
  })
})

describe("the clock's time mapping", () => {
  const clock = buildClock(
    buildTracks(
      [report(0, 0), report(10, 1), report(190, 2), report(200, 3)],
      []
    )
  )

  it("round-trips", () => {
    for (const minutes of [0, 5, 10, 100, 190, 195, 200]) {
      const t = T0 + minutes * MIN
      expect(timeAt(clock, wallAt(clock, t))).toBeCloseTo(t)
    }
  })

  it("clamps to the ends", () => {
    expect(wallAt(clock, Number.NEGATIVE_INFINITY)).toBe(0)
    expect(timeAt(clock, clock.duration + 1)).toBe(clock.end)
    expect(advance(clock, clock.end, 1_000)).toBe(clock.end)
  })

  it("moves through movement at the playback rate", () => {
    // 20 minutes of movement over 30 s: a second of playback is 40 s of reports.
    expect(advance(clock, T0, 1_000)).toBeCloseTo(T0 + 40_000)
  })

  it("crosses a quiet stretch in a moment", () => {
    const next = advance(clock, T0 + 10 * MIN, 1_500)
    expect(next).toBeCloseTo(T0 + 190 * MIN)
    expect(quietAt(clock, T0 + 100 * MIN)?.kind).toBe("gap")
    expect(quietAt(clock, T0 + 5 * MIN)).toBeUndefined()
  })
})

describe("reports", () => {
  const clock = buildClock(
    buildTracks([report(0, 0), report(10, 1), report(20, 2)], [])
  )

  it("steps to the next and previous report", () => {
    expect(stepReport(clock, T0 + 5 * MIN, 1)).toBe(T0 + 10 * MIN)
    expect(stepReport(clock, T0 + 10 * MIN, 1)).toBe(T0 + 20 * MIN)
    expect(stepReport(clock, T0 + 10 * MIN, -1)).toBe(T0)
    expect(stepReport(clock, T0 + 15 * MIN, -1)).toBe(T0 + 10 * MIN)
    expect(stepReport(clock, T0, -1)).toBe(T0)
    expect(stepReport(clock, T0 + 20 * MIN, 1)).toBe(T0 + 20 * MIN)
  })

  it("counts the reports passed", () => {
    expect(reportsPassed(clock, T0 - 1)).toBe(0)
    expect(reportsPassed(clock, T0 + 10 * MIN)).toBe(2)
  })
})

describe("the marker", () => {
  const [track] = buildTracks(
    [report(0, 0), report(10, 1), report(100, 2), report(110, 3)],
    []
  )

  it("is on the line between the reports either side", () => {
    expect(positionAt(track, T0 - 1)).toBeNull()
    expect(positionAt(track, T0 + 5 * MIN)).toEqual([0.5, 52])
    expect(positionAt(track, T0 + 999 * MIN)).toEqual([3, 52])
  })

  it("draws the path travelled, gaps apart", () => {
    expect(travelled(track, 3)).toEqual({
      moving: [
        [
          [0, 52],
          [1, 52],
        ],
        [
          [2, 52],
          [3, 52],
        ],
      ],
      gaps: [
        [
          [1, 52],
          [2, 52],
        ],
      ],
    })
    expect(travelled(track, 0)).toEqual({ moving: [], gaps: [] })
  })

  it("draws the leg from the last report to the marker", () => {
    expect(leg(track, T0 + 5 * MIN)).toEqual({
      line: [
        [0, 52],
        [0.5, 52],
      ],
      gap: false,
    })
    expect(leg(track, T0 + 50 * MIN)?.gap).toBe(90 * MIN > GAP_MS)
    expect(leg(track, T0 + 999 * MIN)).toBeNull()
  })
})

describe("along a road route", () => {
  // Two reports, and a route between them that goes round a corner (east, then north).
  const reports = [report(0, 0), report(10, 0.01)]
  const route: Schemas["TripRoute"] = {
    beacon_id: 1,
    costing: "auto",
    geometry: [
      [0, 52],
      [0.01, 52],
      [0.01, 52.006],
    ],
    reports: [
      {
        observed_at: at(0),
        latitude: 52,
        longitude: 0,
        offset_m: 0,
        off_route: false,
      },
      {
        observed_at: at(10),
        latitude: 52.006,
        longitude: 0.01,
        offset_m: 1352,
        off_route: false,
      },
    ],
    broken_after: [],
    fallback: null,
  }
  const [track] = buildTracks(reports, [], [route])

  it("puts reports on the route and the way between them along it", () => {
    expect(track.coords[1]).toEqual([0.01, 52.006])
    expect(track.legs[0]?.length).toBe(3)
  })

  it("moves the marker along the roads, round the corner", () => {
    const [lon, lat] = positionAt(track, T0 + 7.5 * MIN)!
    expect(lon).toBeCloseTo(0.01, 3) // past the corner: heading north now
    expect(lat).toBeGreaterThan(52.002)
  })

  it("draws the way travelled along the roads", () => {
    expect(travelled(track, 1).moving[0]).toHaveLength(3)
    expect(leg(track, T0 + 7.5 * MIN)?.line.length).toBe(3) // start, corner, marker
  })

  it("ignores a route that fell back to the reports", () => {
    const [plain] = buildTracks(
      reports,
      [],
      [{ ...route, fallback: "no_roads" }]
    )
    expect(plain.legs).toEqual([null])
    expect(plain.coords[1]).toEqual([0.01, 52])
  })
})
