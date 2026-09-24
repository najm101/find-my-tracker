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

/** "Sep 24". */
export function monthDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })
}

/** "Wed, Sep 24". */
export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
}

export function date(iso: string | null | undefined): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" })
}

/** "45 s", "12 min", "3 h 10 min", "2 d 4 h". */
export function duration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return `${s} s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return m % 60 ? `${h} h ${m % 60} min` : `${h} h`
  const d = Math.floor(h / 24)
  return h % 24 ? `${d} d ${h % 24} h` : `${d} d`
}

/** How long between two ISO timestamps, e.g. "3 h 10 min". */
export function durationBetween(from: string, to: string): string {
  return duration((new Date(to).getTime() - new Date(from).getTime()) / 1000)
}

/** "640 m", "3.2 km", "48 km". */
export function distance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  const km = meters / 1000
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`
}
