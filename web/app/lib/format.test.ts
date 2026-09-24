import { describe, expect, it } from "vitest"

import {
  bytes,
  dateTime,
  distance,
  duration,
  durationBetween,
  time,
  timeAgo,
} from "./format"

const NOW = new Date("2026-09-20T12:00:00Z").getTime()
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString()

describe("timeAgo", () => {
  it.each([
    [0.5, /just now/i],
    [12, /12 minutes ago/i],
    [90, /hour/i],
    [60 * 24 * 3, /3 days ago/i],
  ])("describes %s minutes back", (minutes, expected) => {
    expect(timeAgo(ago(minutes), NOW)).toMatch(expected)
  })

  it("looks forward too", () => {
    expect(timeAgo(ago(-30), NOW)).toMatch(/in 30 minutes/i)
  })

  it("says never when there is no time", () => {
    expect(timeAgo(null, NOW)).toBe("never")
    expect(timeAgo(undefined, NOW)).toBe("never")
  })
})

describe("duration", () => {
  it.each([
    [45, "45 s"],
    [60, "1 min"],
    [12 * 60, "12 min"],
    [3 * 3600 + 10 * 60, "3 h 10 min"],
    [5 * 3600, "5 h"],
    [2 * 86400 + 4 * 3600, "2 d 4 h"],
    [3 * 86400, "3 d"],
  ])("formats %i seconds", (seconds, expected) => {
    expect(duration(seconds)).toBe(expected)
  })

  it("never goes negative", () => {
    expect(duration(-10)).toBe("0 s")
  })

  it("measures between two timestamps", () => {
    expect(
      durationBetween("2026-09-20T08:00:00Z", "2026-09-20T11:10:00Z")
    ).toBe("3 h 10 min")
  })
})

describe("distance", () => {
  it.each([
    [640, "640 m"],
    [999, "999 m"],
    [3200, "3.2 km"],
    [48000, "48 km"],
  ])("formats %i metres", (metres, expected) => {
    expect(distance(metres)).toBe(expected)
  })
})

describe("clock formats", () => {
  it("is always 12-hour, whatever the locale default", () => {
    expect(time("2026-09-20T16:10:00Z")).toMatch(/\d{1,2}:\d{2}\s?(AM|PM)/i)
    expect(dateTime("2026-09-20T16:10:00Z")).toMatch(/(AM|PM)/i)
  })

  it("has a placeholder for nothing", () => {
    expect(dateTime(null)).toBe("—")
  })
})

describe("bytes", () => {
  it.each([
    [692_170, "692 KB"],
    [178_506_071, "179 MB"],
    [1_500_000_000, "1.5 GB"],
  ])("formats %s", (n, expected) => {
    expect(bytes(n)).toBe(expected)
  })
})
