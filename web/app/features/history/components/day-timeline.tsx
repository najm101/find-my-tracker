import { MapPinIcon } from "lucide-react"
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

type Props = {
  points: Point[]
  selected?: string | null
  onSelect: (point: Point) => void
}

/** Sightings grouped by day, newest first. */
export function DayTimeline({ points, selected, onSelect }: Props) {
  const days = useMemo(() => {
    const groups = new Map<string, Point[]>()
    for (const p of [...points].reverse()) {
      const day = new Date(p.observed_at).toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      })
      const list = groups.get(day)
      if (list) list.push(p)
      else groups.set(day, [p])
    }
    return [...groups.entries()]
  }, [points])

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
      {days.map(([day, list]) => (
        <section key={day} className="flex flex-col gap-1">
          <h3 className="sticky top-0 z-10 flex justify-between bg-card py-1 text-xs font-medium text-muted-foreground">
            <span>{day}</span>
            <span>{list.length}</span>
          </h3>
          <ul className="flex flex-col">
            {list.map((p) => (
              <li key={p.observed_at}>
                <button
                  type="button"
                  onClick={() => onSelect(p)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                    selected === p.observed_at && "bg-muted"
                  )}
                >
                  <MapPinIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="tabular-nums">{time(p.observed_at)}</span>
                  <span className="truncate text-xs text-muted-foreground tabular-nums">
                    {p.latitude.toFixed(5)}, {p.longitude.toFixed(5)}
                    {p.accuracy_m != null && ` · ±${p.accuracy_m} m`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
