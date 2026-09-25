import { describe, expect, it } from "vitest"

import { freshness } from "./freshness"
import { describeInterval } from "./poll-intervals"

const NOW = Date.parse("2026-09-25T12:00:00Z")

describe("freshness", () => {
  it("is within the hour, within the day, older, or never", () => {
    expect(freshness("2026-09-25T11:30:00Z", NOW)).toBe("fresh")
    expect(freshness("2026-09-25T02:00:00Z", NOW)).toBe("recent")
    expect(freshness("2026-09-23T12:00:00Z", NOW)).toBe("stale")
    expect(freshness(null, NOW)).toBe("none")
  })
})

describe("describeInterval", () => {
  it("reads as a phrase", () => {
    expect(describeInterval(30)).toBe("every 30 minutes")
    expect(describeInterval(1440)).toBe("once a day")
    expect(describeInterval(3 * 1440)).toBe("every 3 days")
    expect(describeInterval(45)).toBe("every 45 minutes")
  })
})
