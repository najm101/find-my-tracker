/** How recent an item's last sighting is, for a glance at the list. */
export type Freshness = "fresh" | "recent" | "stale" | "none"

const HOUR_MS = 60 * 60_000

/** Seen within the hour, within the day, longer ago, or never. */
export function freshness(
  observedAt: string | null | undefined,
  now: number
): Freshness {
  if (!observedAt) return "none"
  const age = now - Date.parse(observedAt)
  if (age < HOUR_MS) return "fresh"
  if (age < 24 * HOUR_MS) return "recent"
  return "stale"
}
