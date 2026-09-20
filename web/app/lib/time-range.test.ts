import { describe, expect, it } from "vitest"

import { describeRange, rangeFromParams, withRange } from "./time-range"

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
})
