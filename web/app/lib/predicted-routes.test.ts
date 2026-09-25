import { describe, expect, it } from "vitest"

import type { Schemas } from "~/lib/api/client"

import {
  coveredKeys,
  offRouteKeys,
  reportKey,
  routeLines,
  tripKey,
} from "./predicted-routes"

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

describe("routeLines", () => {
  it("follows the roads, and dashes where the way is not known", () => {
    const lines = routeLines(route)
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

  it("joins up the reports when there is no predicted route", () => {
    const lines = routeLines({ ...route, fallback: "no_roads", geometry: [] })
    expect(lines.road).toEqual([])
    expect(lines.reported[0]).toHaveLength(4)
    expect(lines.head).toBeNull()
  })

  it("draws a trip in from its start, by distance along it", () => {
    const start = routeLines(route, 0)
    expect(start.road).toEqual([])
    expect(start.head).toEqual([0, 52])

    // A sixth of the way is halfway to the second report: through none of the vertices.
    const sixth = routeLines(route, 1 / 6)
    expect(sixth.road).toHaveLength(1)
    expect(sixth.road[0][0]).toEqual([0, 52])
    expect(sixth.head?.[0]).toBeCloseTo(0.005, 3)
    expect(sixth.unknown).toEqual([])

    // Half way is half way along the break: the dashed line stops there.
    const half = routeLines(route, 0.5)
    expect(half.road).toHaveLength(1)
    expect(half.unknown).toHaveLength(1)
    expect(half.unknown[0][1][0]).toBeCloseTo(0.015, 6)
    expect(half.head).toEqual(half.unknown[0][1])

    expect(routeLines(route, 1)).toEqual(routeLines(route))
    expect(routeLines(route).head).toBeNull()
  })
})

describe("offRouteKeys", () => {
  it("names the reports left off the route, as history names them", () => {
    const keys = offRouteKeys([route])
    expect(keys).toEqual(new Set([reportKey(7, "2026-09-20T08:10:00.000Z")]))
  })
})

describe("coveredKeys and tripKey", () => {
  it("name the reports a route covers, and the trip by its first", () => {
    expect(coveredKeys([route]).size).toBe(4)
    expect(coveredKeys([route])).toContain(reportKey(7, "2026-09-20T08:15:00Z"))
    expect(tripKey(route)).toBe(reportKey(7, "2026-09-20T08:00:00Z"))
  })
})
