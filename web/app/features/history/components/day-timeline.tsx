import { MapPinIcon, MapPinnedIcon, TriangleAlertIcon } from "lucide-react"
import { useMemo } from "react"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "~/components/ui/empty"
import type { Schemas } from "~/lib/api/client"
import { time } from "~/lib/format"
import { cn } from "~/lib/utils"

type Point = Schemas["LocationPoint"]
type Stay = Schemas["Stay"]
type Noise = NonNullable<Point["noise"]>

export type TimelineTarget = {
  latitude: number
  longitude: number
  key: string
}

type Entry =
  | { kind: "point"; at: string; point: Point }
  | { kind: "stay"; at: string; stay: Stay }

const NOISE: Record<Noise, string> = {
  spike: "Far from the reports just before and after it",
  too_fast: "Getting there would need an impossible speed",
  imprecise: "Poor accuracy, and it disagrees with nearby reports",
}

type Props = {
  points: Point[]
  /** Collapse these into one row each. Pass none to list every report. */
  stays: Stay[]
  selected?: string | null
  onSelect: (target: TimelineTarget) => void
}

/** Sightings grouped by day, newest first. Stays show as one row. */
export function DayTimeline({ points, stays, selected, onSelect }: Props) {
  const days = useMemo(() => {
    const entries: Entry[] = []
    const inStay = (p: Point) =>
      stays.some(
        (s) =>
          s.beacon_id === p.beacon_id &&
          p.observed_at >= s.arrived_at &&
          p.observed_at <= s.left_at
      )
    for (const p of points) {
      if (!inStay(p))
        entries.push({ kind: "point", at: p.observed_at, point: p })
    }
    for (const s of stays)
      entries.push({ kind: "stay", at: s.left_at, stay: s })
    entries.sort((a, b) => b.at.localeCompare(a.at))

    const groups = new Map<string, { entries: Entry[]; reports: number }>()
    for (const e of entries) {
      const day = new Date(e.at).toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      })
      const group = groups.get(day) ?? { entries: [], reports: 0 }
      group.entries.push(e)
      group.reports += e.kind === "stay" ? e.stay.point_count : 1
      groups.set(day, group)
    }
    return [...groups.entries()]
  }, [points, stays])

  if (points.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No sightings in this range</EmptyTitle>
          <EmptyDescription>
            Try a longer range, or wait for the next check.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {days.map(([day, group]) => (
        <section key={day} className="flex flex-col gap-1">
          <h3 className="sticky top-0 z-10 flex justify-between bg-card py-1 text-xs font-medium text-muted-foreground">
            <span>{day}</span>
            <span>{group.reports}</span>
          </h3>
          <ul className="flex flex-col">
            {group.entries.map((e) => (
              <li key={`${e.kind}-${e.at}`}>
                {e.kind === "stay" ? (
                  <StayRow
                    stay={e.stay}
                    selected={selected === `stay-${e.stay.arrived_at}`}
                    onSelect={onSelect}
                  />
                ) : (
                  <PointRow
                    point={e.point}
                    selected={selected === e.point.observed_at}
                    onSelect={onSelect}
                  />
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

const ROW =
  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"

function StayRow({
  stay,
  selected,
  onSelect,
}: {
  stay: Stay
  selected: boolean
  onSelect: (target: TimelineTarget) => void
}) {
  return (
    <button
      type="button"
      onClick={() =>
        onSelect({
          latitude: stay.latitude,
          longitude: stay.longitude,
          key: `stay-${stay.arrived_at}`,
        })
      }
      className={cn(ROW, "items-start", selected && "bg-muted")}
    >
      <MapPinnedIcon className="mt-0.5 size-3.5 shrink-0 text-foreground" />
      <span className="flex min-w-0 flex-col">
        <span className="tabular-nums">
          {time(stay.arrived_at)} – {time(stay.left_at)}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          Stayed here · {stay.point_count} reports ·{" "}
          <span className="tabular-nums">
            {stay.latitude.toFixed(5)}, {stay.longitude.toFixed(5)}
          </span>
        </span>
      </span>
    </button>
  )
}

function PointRow({
  point,
  selected,
  onSelect,
}: {
  point: Point
  selected: boolean
  onSelect: (target: TimelineTarget) => void
}) {
  const Icon = point.noise ? TriangleAlertIcon : MapPinIcon
  return (
    <button
      type="button"
      title={point.noise ? NOISE[point.noise] : undefined}
      onClick={() =>
        onSelect({
          latitude: point.latitude,
          longitude: point.longitude,
          key: point.observed_at,
        })
      }
      className={cn(ROW, selected && "bg-muted", point.noise && "opacity-60")}
    >
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="shrink-0 tabular-nums">{time(point.observed_at)}</span>
      <span className="min-w-0 truncate text-xs text-muted-foreground tabular-nums">
        {point.noise
          ? NOISE[point.noise]
          : `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`}
        {point.accuracy_m != null && ` · ±${point.accuracy_m} m`}
      </span>
    </button>
  )
}
