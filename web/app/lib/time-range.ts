/**
 * The history time range lives in the URL (`?range=7d` or `?from=…&to=…`), so views are
 * shareable, survive reloads, and every route reads it the same way.
 */

export type RangePreset = "24h" | "7d" | "30d"

export const RANGE_PRESETS: {
  value: RangePreset
  label: string
  hours: number
}[] = [
  { value: "24h", label: "Last 24 hours", hours: 24 },
  { value: "7d", label: "Last 7 days", hours: 24 * 7 },
  { value: "30d", label: "Last 30 days", hours: 24 * 30 },
]

export type TimeRange = { preset: RangePreset | "custom"; from: Date; to: Date }

const DEFAULT_PRESET: RangePreset = "24h"

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
    from: new Date(now.getTime() - preset.hours * 3_600_000),
    to: now,
  }
}

/** Returns a copy of `params` with the range applied (and the other form removed). */
export function withRange(
  params: URLSearchParams,
  range: { preset: RangePreset } | { from: Date; to: Date }
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

export function describeRange(range: TimeRange): string {
  if (range.preset !== "custom") {
    return RANGE_PRESETS.find((p) => p.value === range.preset)!.label
  }
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
  return `${fmt(range.from)} – ${fmt(range.to)}`
}
