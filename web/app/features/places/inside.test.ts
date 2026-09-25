import { describe, expect, it } from "vitest"

import type { Schemas } from "~/lib/api/client"
import { reportKey } from "~/lib/predicted-routes"

import { highlightKeys, inVisit, sightingsInside, visitKey } from "./inside"

const PLACE = { lat: 52.37, lon: 4.9 }

function point(
  beacon: number,
  minute: number,
  north_m: number
): Schemas["LocationPoint"] {
  return {
    beacon_id: beacon,
    observed_at: `2026-09-20T08:${String(minute).padStart(2, "0")}:00Z`,
    latitude: PLACE.lat + north_m / 111_320,
    longitude: PLACE.lon,
    accuracy_m: 20,
    noise: null,
  }
}

const visit = (beacon: number, from: number, to: number) => ({
  beacon_id: beacon,
  arrived_at: `2026-09-20T08:${String(from).padStart(2, "0")}:00Z`,
  left_at: `2026-09-20T08:${String(to).padStart(2, "0")}:00Z`,
  point_count: 2,
  closest_m: 10,
})

describe("inside a place", () => {
  const points = [
    point(1, 0, 10),
    point(1, 5, 150),
    point(1, 40, 20),
    point(2, 3, 350),
  ]

  it("keeps the sightings within the radius", () => {
    expect(
      sightingsInside(points, PLACE, 200).map((p) => p.observed_at)
    ).toEqual([
      "2026-09-20T08:00:00Z",
      "2026-09-20T08:05:00Z",
      "2026-09-20T08:40:00Z",
    ])
  })

  it("highlights all of them, or only the chosen visit's", () => {
    const inside = sightingsInside(points, PLACE, 200)
    expect(highlightKeys(inside, null).size).toBe(3)
    const first = visit(1, 0, 5)
    expect(inVisit(inside[2], first)).toBe(false)
    expect(highlightKeys(inside, first)).toEqual(
      new Set([
        reportKey(1, "2026-09-20T08:00:00Z"),
        reportKey(1, "2026-09-20T08:05:00Z"),
      ])
    )
  })

  it("names a visit by its item and arrival", () => {
    expect(visitKey(visit(1, 0, 5))).toBe(
      `1@${Date.parse("2026-09-20T08:00:00Z")}`
    )
  })
})
