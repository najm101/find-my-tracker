/** How long history can be kept, as offered in Settings. Null keeps it for good. */
export const RETENTION_CHOICES: { days: number | null; label: string }[] = [
  { days: null, label: "Keep everything" },
  { days: 30, label: "30 days" },
  { days: 60, label: "60 days" },
  { days: 90, label: "90 days" },
  { days: 182, label: "6 months" },
  { days: 365, label: "1 year" },
  { days: 730, label: "2 years" },
]

export function retentionLabel(days: number): string {
  return RETENTION_CHOICES.find((c) => c.days === days)?.label ?? `${days} days`
}

/**
 * Whether going from `current` to `next` can delete anything now: only a shorter period, or a
 * first one, can. A longer one (or keeping everything) only changes what goes from then on.
 */
export function mayDelete(
  current: number | null,
  next: number | null
): boolean {
  return next !== null && (current === null || next < current)
}
