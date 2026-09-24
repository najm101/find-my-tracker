import { describe, expect, it } from "vitest"

import type { Schemas } from "~/lib/api/client"

import { offRouteKeys, reportKey, roadLines } from "./road-routes"

const report = (minute: number, lon: number, offset: number, off = false) => ({
  observed_at: `2026-09-20T08:${String(minute).padStart(2, "0")}:00Z`,
  latitude: 52,
  longitude: lon,
  offset_m: offset,
  off_route: off,
})

// Along latitude 52: 0.01° of longitude is about 685 m.
const route: Schemas["TripRoute"] = {
  beacon_id: 7,
  costing: "auto",
  geometry: [
    [0, 52],
    [0.005, 52],
    [0.01, 52],
    [0.02, 52],
    [0.03, 52],
  ],
  reports: [
    report(0, 0, 0),
    report(5, 0.01, 685),
    report(10, 0.02, 1370, true),
    report(15, 0.03, 2055),
  ],
  broken_after: [1],
  fallback: null,
}

describe("roadLines", () => {
  it("follows the roads, and dashes where the way is not known", () => {
    const lines = roadLines(route)
    expect(lines.road).toHaveLength(2) // before and after the break
    expect(lines.road[0].length).toBeGreaterThanOrEqual(3) // through the vertex at 0.005
    expect(lines.unknown).toEqual([
      [
        [0.01, 52],
        [0.02, 52],
      ],
    ])
    expect(lines.reported).toEqual([])
  })

  it("joins up the reports when there is no road route", () => {
    const lines = roadLines({ ...route, fallback: "no_roads", geometry: [] })
    expect(lines.road).toEqual([])
    expect(lines.reported[0]).toHaveLength(4)
  })
})

describe("offRouteKeys", () => {
  it("names the reports left off the route, as history names them", () => {
    const keys = offRouteKeys([route])
    expect(keys).toEqual(new Set([reportKey(7, "2026-09-20T08:10:00.000Z")]))
  })
})
