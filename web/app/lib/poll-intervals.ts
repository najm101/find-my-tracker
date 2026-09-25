/**
 * How often the server can check Apple, in minutes: 30 minutes to 7 days (the server enforces
 * both). Only *shorter* intervals risk an Apple ban. Longer ones make the latest position older
 * and, past a day, leave less room for a check that fails.
 */

const HOUR = 60
export const DAY = 24 * HOUR

export const DEFAULT_POLL_MINUTES = 30

export const POLL_INTERVALS: { minutes: number; label: string }[] = [
  { minutes: 30, label: "Every 30 minutes" },
  { minutes: HOUR, label: "Every hour" },
  { minutes: 2 * HOUR, label: "Every 2 hours" },
  { minutes: 6 * HOUR, label: "Every 6 hours" },
  { minutes: 12 * HOUR, label: "Every 12 hours" },
  { minutes: DAY, label: "Once a day" },
  ...[2, 3, 4, 5, 6, 7].map((days) => ({
    minutes: days * DAY,
    label: `Every ${days} days`,
  })),
]
