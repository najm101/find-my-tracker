import { describe, expect, it } from "vitest"

import type { Schemas } from "~/lib/api/client"

import { buildRows, indexStays, rowKeyFor, stayAt } from "./timeline"

type Point = Schemas["LocationPoint"]
type Stay = Schemas["Stay"]

/** Local noon, so every assertion about calendar days holds in any timezone. */
const at = (year: number, month: number, day: number, hour = 12, minute = 0) =>
  new Date(year, month - 1, day, hour, minute).toISOString()

const point = (observed_at: string, beacon_id = 1): Point => ({
  beacon_id,
  observed_at,
  latitude: 52.37,
  longitude: 4.89,
  accuracy_m: 20,
  noise: null,
})

const stay = (
  arrived_at: string,
  left_at: string,
  beacon_id = 1,
  point_count = 3
): Stay => ({
  beacon_id,
  arrived_at,
  left_at,
  latitude: 52.37,
  longitude: 4.89,
  point_count,
})

describe("stayAt", () => {
  const stays = [
    stay(at(2026, 9, 20, 8), at(2026, 9, 20, 9)),
    stay(at(2026, 9, 20, 14), at(2026, 9, 20, 16)),
    stay(at(2026, 9, 21, 8), at(2026, 9, 21, 10)),
  ]
  const index = indexStays(stays)

  it("finds the stay a report sits inside", () => {
    expect(stayAt(index, point(at(2026, 9, 20, 15)))).toBe(stays[1])
  })

  it("counts the edges as inside", () => {
    expect(stayAt(index, point(at(2026, 9, 20, 14)))).toBe(stays[1])
    expect(stayAt(index, point(at(2026, 9, 20, 16)))).toBe(stays[1])
  })

  it("returns nothing between, before and after stays", () => {
    expect(stayAt(index, point(at(2026, 9, 20, 11)))).toBeUndefined()
    expect(stayAt(index, point(at(2026, 9, 20, 1)))).toBeUndefined()
    expect(stayAt(index, point(at(2026, 9, 22, 1)))).toBeUndefined()
  })

  it("does not mix beacons up", () => {
    expect(stayAt(index, point(at(2026, 9, 20, 15), 2))).toBeUndefined()
  })
})

describe("rowKeyFor", () => {
  it("gives every report of a stay the same row", () => {
    const s = stay(at(2026, 9, 20, 8), at(2026, 9, 20, 9))
    const index = indexStays([s])
    const first = rowKeyFor(index, point(at(2026, 9, 20, 8)))
    expect(rowKeyFor(index, point(at(2026, 9, 20, 8, 30)))).toBe(first)
  })

  it("keeps identical times on two beacons apart", () => {
    const index = indexStays([
      stay(at(2026, 9, 20, 8), at(2026, 9, 20, 9), 1),
      stay(at(2026, 9, 20, 8), at(2026, 9, 20, 9), 2),
    ])
    expect(rowKeyFor(index, point(at(2026, 9, 20, 8), 1))).not.toBe(
      rowKeyFor(index, point(at(2026, 9, 20, 8), 2))
    )
  })

  it("falls back to the report's own time", () => {
    const observed = at(2026, 9, 20, 11)
    expect(rowKeyFor(indexStays([]), point(observed))).toBe(observed)
  })
})

describe("buildRows", () => {
  it("lists days newest first, with the reports inside each one", () => {
    const rows = buildRows(
      [point(at(2026, 9, 19, 10)), point(at(2026, 9, 20, 10))],
      []
    )
    expect(rows.map((r) => r.type)).toEqual(["day", "point", "day", "point"])
    const [today] = rows
    expect(today.type === "day" && today.reports).toBe(1)
  })

  it("folds a stay's reports into one row and counts them all", () => {
    const rows = buildRows(
      [
        point(at(2026, 9, 20, 8)),
        point(at(2026, 9, 20, 8, 20)),
        point(at(2026, 9, 20, 8, 40)),
        point(at(2026, 9, 20, 11)),
      ],
      [stay(at(2026, 9, 20, 8), at(2026, 9, 20, 9), 1, 3)]
    )
    expect(rows.map((r) => r.type)).toEqual(["day", "point", "stay"])
    const [day] = rows
    // Three folded reports plus the loose one.
    expect(day.type === "day" && day.reports).toBe(4)
  })

  it("keeps the same calendar day in different years apart", () => {
    const rows = buildRows(
      [point(at(2025, 9, 20, 10)), point(at(2026, 9, 20, 10))],
      []
    )
    const days = rows.filter((r) => r.type === "day")
    expect(days).toHaveLength(2)
    // Same wording, different rows — so they must not share a key.
    expect(days[0].type === "day" && days[1].type === "day").toBe(true)
    expect(days[0].key).not.toBe(days[1].key)
  })

  it("gives every row a key of its own", () => {
    const rows = buildRows(
      [point(at(2026, 9, 20, 8)), point(at(2026, 9, 20, 9), 2)],
      [stay(at(2026, 9, 21, 8), at(2026, 9, 21, 9))]
    )
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length)
  })

  it("has nothing to show for nothing", () => {
    expect(buildRows([], [])).toEqual([])
  })
})
