import type { Schemas } from "~/lib/api/client"

type Point = Schemas["LocationPoint"]
type Stay = Schemas["Stay"]

export type DayRow = {
  type: "day"
  key: string
  label: string
  /** How many reports the day holds, stays counted in full. */
  reports: number
}

export type TimelineRow =
  | DayRow
  | { type: "point"; key: string; point: Point }
  | { type: "stay"; key: string; stay: Stay }

/**
 * Stays grouped per beacon. They come back sorted by time and never overlap, so the groups
 * can be searched rather than scanned — history runs to tens of thousands of reports.
 */
export type StayIndex = Map<number, Stay[]>

export function indexStays(stays: Stay[]): StayIndex {
  const index: StayIndex = new Map()
  for (const stay of stays) {
    const group = index.get(stay.beacon_id)
    if (group) group.push(stay)
    else index.set(stay.beacon_id, [stay])
  }
  return index
}

/** The stay a report falls inside, if any. Timestamps are ISO UTC, so they sort as strings. */
export function stayAt(index: StayIndex, point: Point): Stay | undefined {
  const stays = index.get(point.beacon_id)
  if (!stays) return undefined
  let low = 0
  let high = stays.length - 1
  while (low <= high) {
    const mid = (low + high) >> 1
    const stay = stays[mid]
    if (point.observed_at < stay.arrived_at) high = mid - 1
    else if (point.observed_at > stay.left_at) low = mid + 1
    else return stay
  }
  return undefined
}

/** The timeline row a report is shown in: its stay's row when it is part of one. */
export function rowKeyFor(index: StayIndex, point: Point): string {
  const stay = stayAt(index, point)
  return stay ? stayKey(stay) : point.observed_at
}

const stayKey = (stay: Stay) => `stay-${stay.beacon_id}-${stay.arrived_at}`

/**
 * One flat list of day headings and entries, newest first: a shape a virtualiser can index.
 * Reports that belong to a stay are folded into that stay's single row.
 */
export function buildRows(points: Point[], stays: Stay[]): TimelineRow[] {
  const index = indexStays(stays)
  const entries: { at: string; row: TimelineRow; reports: number }[] = []

  for (const point of points) {
    if (stayAt(index, point)) continue
    entries.push({
      at: point.observed_at,
      reports: 1,
      row: { type: "point", key: point.observed_at, point },
    })
  }
  for (const stay of stays) {
    entries.push({
      at: stay.left_at,
      reports: stay.point_count,
      row: { type: "stay", key: stayKey(stay), stay },
    })
  }
  entries.sort((a, b) => b.at.localeCompare(a.at))

  const rows: TimelineRow[] = []
  let day: DayRow | null = null
  for (const entry of entries) {
    const key = dayKey(entry.at)
    if (day === null || day.key !== key) {
      day = { type: "day", key, label: dayLabel(entry.at), reports: 0 }
      rows.push(day)
    }
    day.reports += entry.reports
    rows.push(entry.row)
  }
  return rows
}

/**
 * The viewer's own calendar day. Keying on the label would merge "Monday, 20 September" a year
 * apart, and keying on the UTC date would split an evening in a timezone ahead of UTC.
 */
function dayKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
}
