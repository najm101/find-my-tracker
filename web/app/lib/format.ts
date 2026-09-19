const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
]

/** "12 minutes ago", "in 3 minutes", "just now". */
export function timeAgo(
  iso: string | null | undefined,
  now = Date.now()
): string {
  if (!iso) return "never"
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000)
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size)
      return relative.format(Math.round(seconds / size), unit)
  }
  return "just now"
}

// Times are always 12-hour ("4:10 PM"), whatever the browser's locale default is.
const TIME: Intl.DateTimeFormatOptions = {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...TIME,
  })
}

export function time(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, TIME)
}

export function date(iso: string | null | undefined): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" })
}
