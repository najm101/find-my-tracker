import { describe, expect, it } from "vitest"

import {
  type TimeRange,
  describeRange,
  isLatest,
  rangeFromParams,
  rangeKey,
  shiftRange,
  wholeDays,
  withRange,
} from "./time-range"

const NOW = new Date("2026-09-20T12:00:00Z")
const params = (query: string) => new URLSearchParams(query)

describe("rangeFromParams", () => {
  it("defaults to the last 24 hours", () => {
    const range = rangeFromParams(params(""), NOW)
    expect(range.preset).toBe("24h")
    expect(range.to).toEqual(NOW)
    expect(range.from).toEqual(new Date("2026-09-19T12:00:00Z"))
  })

  it("reads a preset", () => {
    expect(rangeFromParams(params("range=7d"), NOW).from).toEqual(
      new Date("2026-09-13T12:00:00Z")
    )
  })

  it("reads an hour preset", () => {
    expect(rangeFromParams(params("range=3h"), NOW).from).toEqual(
      new Date("2026-09-20T09:00:00Z")
    )
  })

  it("reads a custom range", () => {
    const range = rangeFromParams(
      params("from=2026-09-01T00:00:00Z&to=2026-09-05T00:00:00Z"),
      NOW
    )
    expect(range.preset).toBe("custom")
    expect(range.from).toEqual(new Date("2026-09-01T00:00:00Z"))
  })

  it.each([
    ["an unknown preset", "range=all-time"],
    [
      "a backwards custom range",
      "from=2026-09-05T00:00:00Z&to=2026-09-01T00:00:00Z",
    ],
    ["an unparseable date", "from=yesterday&to=today"],
    ["a half-given custom range", "from=2026-09-01T00:00:00Z"],
  ])("falls back to the default for %s", (_, query) => {
    expect(rangeFromParams(params(query), NOW).preset).toBe("24h")
  })
})

describe("withRange", () => {
  it("drops the default preset from the URL", () => {
    expect(withRange(params("range=7d"), { preset: "24h" }).toString()).toBe("")
  })

  it("replaces a custom range with a preset", () => {
    const next = withRange(
      params("from=2026-09-01T00:00:00Z&to=2026-09-05T00:00:00Z"),
      {
        preset: "30d",
      }
    )
    expect(next.get("range")).toBe("30d")
    expect(next.has("from")).toBe(false)
  })

  it("replaces a preset with a custom range", () => {
    const next = withRange(params("range=7d"), {
      from: new Date("2026-09-01T00:00:00Z"),
      to: new Date("2026-09-05T00:00:00Z"),
    })
    expect(next.has("range")).toBe(false)
    expect(next.get("from")).toBe("2026-09-01T00:00:00.000Z")
  })

  it("keeps unrelated params", () => {
    expect(
      withRange(params("hide=3&range=7d"), { preset: "30d" }).get("hide")
    ).toBe("3")
  })
})

describe("describeRange", () => {
  it("names a preset", () => {
    expect(describeRange(rangeFromParams(params("range=30d"), NOW))).toBe(
      "Last 30 days"
    )
  })

  it("spells out a custom range", () => {
    const range = rangeFromParams(
      params("from=2026-09-01T12:00:00Z&to=2026-09-05T12:00:00Z"),
      NOW
    )
    expect(describeRange(range)).toMatch(/–/)
  })

  it("names whole days by date only", () => {
    const label = describeRange(custom(local(1), local(5, 23, 59, 59, 999)))
    expect(label).not.toMatch(/AM|PM/)
    expect(label).toMatch(/–/)
  })

  it("gives the times of a window inside one day, 12-hour", () => {
    const label = describeRange(custom(local(1, 9), local(1, 15)))
    expect(label).toMatch(/9:00\sAM/)
    expect(label).toMatch(/3:00\sPM/)
  })
})

// Local times: whole days are the viewer's own calendar days, whatever the test machine's zone.
const local = (day: number, h = 0, m = 0, s = 0, ms = 0) =>
  new Date(2026, 8, day, h, m, s, ms)
const custom = (from: Date, to: Date): TimeRange => ({
  preset: "custom",
  from,
  to,
})

describe("wholeDays", () => {
  it("counts days from a midnight to a day's end", () => {
    expect(wholeDays(custom(local(1), local(1, 23, 59, 59, 999)))).toBe(1)
    expect(wholeDays(custom(local(1), local(5, 23, 59, 59, 999)))).toBe(5)
  })

  it("is 0 for a window with times", () => {
    expect(wholeDays(custom(local(1, 9), local(1, 15)))).toBe(0)
  })
})

describe("shiftRange", () => {
  const now = local(20, 12)

  it("steps an hour window back by its length", () => {
    expect(shiftRange(custom(local(10, 9), local(10, 15)), -1, now)).toEqual({
      from: local(10, 3),
      to: local(10, 9),
    })
  })

  it("steps whole days by calendar days", () => {
    expect(
      shiftRange(custom(local(10), local(11, 23, 59, 59, 999)), 1, now)
    ).toEqual({ from: local(12), to: local(13, 23, 59, 59, 999) })
  })

  it("steps back from a preset", () => {
    const range = rangeFromParams(params("range=6h"), now)
    expect(shiftRange(range, -1, now)).toEqual({
      from: local(20, 0),
      to: local(20, 6),
    })
  })

  it("lands on the matching preset when it reaches the present", () => {
    expect(shiftRange(custom(local(20, 0), local(20, 6)), 1, now)).toEqual({
      preset: "6h",
    })
  })

  it("ends at now when no preset matches", () => {
    expect(shiftRange(custom(local(20, 3), local(20, 8)), 1, now)).toEqual({
      from: local(20, 7),
      to: now,
    })
  })
})

describe("isLatest", () => {
  const now = local(20, 12)

  it("is true for a preset and for a window ending now", () => {
    expect(isLatest(rangeFromParams(params("range=1h"), now), now)).toBe(true)
    expect(isLatest(custom(local(20, 0), local(20, 23, 59)), now)).toBe(true)
  })

  it("is false for a window in the past", () => {
    expect(isLatest(custom(local(19, 0), local(19, 6)), now)).toBe(false)
  })
})

describe("rangeKey", () => {
  it("keeps a preset's key as the clock moves", () => {
    const later = new Date(NOW.getTime() + 60_000)
    expect(rangeKey(rangeFromParams(params("range=6h"), NOW))).toBe(
      rangeKey(rangeFromParams(params("range=6h"), later))
    )
  })
})
