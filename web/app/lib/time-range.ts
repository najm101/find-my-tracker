/**
 * The history time range lives in the URL (`?range=7d` or `?from=…&to=…`), so views are
 * shareable, survive reloads, and every route reads it the same way.
 */

import { monthDay, time } from "./format"

export type RangePreset = "1h" | "3h" | "6h" | "12h" | "24h" | "7d" | "30d"

export const RANGE_PRESETS: {
  value: RangePreset
  /** For the compact buttons in the picker. */
  short: string
  label: string
  hours: number
}[] = [
  { value: "1h", short: "1h", label: "Last hour", hours: 1 },
  { value: "3h", short: "3h", label: "Last 3 hours", hours: 3 },
  { value: "6h", short: "6h", label: "Last 6 hours", hours: 6 },
  { value: "12h", short: "12h", label: "Last 12 hours", hours: 12 },
  { value: "24h", short: "24h", label: "Last 24 hours", hours: 24 },
  { value: "7d", short: "7d", label: "Last 7 days", hours: 24 * 7 },
  { value: "30d", short: "30d", label: "Last 30 days", hours: 24 * 30 },
]

export type TimeRange = { preset: RangePreset | "custom"; from: Date; to: Date }

/** What `withRange` takes: a rolling preset, or a fixed window. */
export type RangeChoice = { preset: RangePreset } | { from: Date; to: Date }

const DEFAULT_PRESET: RangePreset = "24h"
const MINUTE = 60_000
const HOUR = 60 * MINUTE

export function rangeFromParams(
  params: URLSearchParams,
  now = new Date()
): TimeRange {
  const from = params.get("from")
  const to = params.get("to")
  if (from && to) {
    const f = new Date(from)
    const t = new Date(to)
    if (!Number.isNaN(f.getTime()) && !Number.isNaN(t.getTime()) && f <= t) {
      return { preset: "custom", from: f, to: t }
    }
  }
  const preset =
    RANGE_PRESETS.find((p) => p.value === params.get("range")) ??
    RANGE_PRESETS.find((p) => p.value === DEFAULT_PRESET)!
  return {
    preset: preset.value,
    from: new Date(now.getTime() - preset.hours * HOUR),
    to: now,
  }
}

/** Returns a copy of `params` with the range applied (and the other form removed). */
export function withRange(
  params: URLSearchParams,
  range: RangeChoice
): URLSearchParams {
  const next = new URLSearchParams(params)
  next.delete("range")
  next.delete("from")
  next.delete("to")
  if ("preset" in range) {
    if (range.preset !== DEFAULT_PRESET) next.set("range", range.preset)
  } else {
    next.set("from", range.from.toISOString())
    next.set("to", range.to.toISOString())
  }
  return next
}

/**
 * Names the range the way the URL does. A preset rolls forward with the clock, so its dates
 * change on every refresh while it stays the same choice.
 */
export function rangeKey(range: TimeRange): string {
  return range.preset === "custom"
    ? `${range.from.toISOString()}|${range.to.toISOString()}`
    : range.preset
}

/**
 * How many calendar days the range covers when it runs from a midnight to the end of a day
 * (what the picker makes of whole days), else 0.
 */
export function wholeDays(range: TimeRange): number {
  const { from, to } = range
  const startsAtMidnight =
    from.getHours() === 0 &&
    from.getMinutes() === 0 &&
    from.getSeconds() === 0 &&
    from.getMilliseconds() === 0
  const endsAtDayEnd =
    to.getHours() === 23 &&
    to.getMinutes() === 59 &&
    to.getSeconds() === 59 &&
    to.getMilliseconds() === 999
  if (!startsAtMidnight || !endsAtDayEnd) return 0
  const lastMidnight = new Date(to)
  lastMidnight.setHours(0, 0, 0, 0)
  // Rounded: a daylight-saving change makes one day 23 or 25 hours long.
  return Math.round((lastMidnight.getTime() - from.getTime()) / (24 * HOUR)) + 1
}

/**
 * The window of the same length just before (-1) or after (1) this one. Whole days step by
 * calendar days. Stepping forward into the present lands on the matching "Last …" preset, so the
 * window keeps up with new reports.
 */
export function shiftRange(
  range: TimeRange,
  direction: -1 | 1,
  now = new Date()
): RangeChoice {
  const days = wholeDays(range)
  if (days > 0) {
    const from = new Date(range.from)
    from.setDate(from.getDate() + direction * days)
    const to = new Date(range.to)
    to.setDate(to.getDate() + direction * days)
    return { from, to }
  }
  const length =
    Math.round((range.to.getTime() - range.from.getTime()) / MINUTE) * MINUTE
  const to = range.to.getTime() + direction * length
  if (direction === 1 && to >= now.getTime() - MINUTE) {
    const preset = RANGE_PRESETS.find((p) => p.hours * HOUR === length)
    if (preset) return { preset: preset.value }
    return { from: new Date(now.getTime() - length), to: now }
  }
  return {
    from: new Date(range.from.getTime() + direction * length),
    to: new Date(to),
  }
}

/** Whether the range already reaches the present, leaving nothing later to step to. */
export function isLatest(range: TimeRange, now: Date): boolean {
  return (
    range.preset !== "custom" || range.to.getTime() >= now.getTime() - MINUTE
  )
}

export function describeRange(range: TimeRange): string {
  if (range.preset !== "custom") {
    return RANGE_PRESETS.find((p) => p.value === range.preset)!.label
  }
  const from = range.from.toISOString()
  const to = range.to.toISOString()
  const days = wholeDays(range)
  if (days === 1) return monthDay(from)
  if (days > 1) return `${monthDay(from)} – ${monthDay(to)}`
  if (range.from.toDateString() === range.to.toDateString()) {
    return `${monthDay(from)}, ${time(from)} – ${time(to)}`
  }
  return `${monthDay(from)}, ${time(from)} – ${monthDay(to)}, ${time(to)}`
}
