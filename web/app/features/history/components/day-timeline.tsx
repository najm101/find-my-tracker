import { useVirtualizer } from "@tanstack/react-virtual"
import { MapPinIcon, MapPinnedIcon, TriangleAlertIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef } from "react"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "~/components/ui/empty"
import { ScrollArea } from "~/components/ui/scroll-area"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip"
import type { Schemas } from "~/lib/api/client"
import { time } from "~/lib/format"
import { cn } from "~/lib/utils"

import { buildRows, type TimelineRow } from "../timeline"

type Point = Schemas["LocationPoint"]
type Stay = Schemas["Stay"]
type Noise = NonNullable<Point["noise"]>

export type TimelineTarget = {
  latitude: number
  longitude: number
  key: string
}

const NOISE: Record<Noise, string> = {
  spike: "Far from the reports just before and after it",
  too_fast: "Getting there would need an impossible speed",
  imprecise: "Poor accuracy, and it disagrees with nearby reports",
}

/** Rough row heights; the virtualiser measures the real ones as they render. */
const ESTIMATE = { day: 28, entry: 34 }

type Props = {
  points: Point[]
  /** Collapse these into one row each. Pass none to list every report. */
  stays: Stay[]
  /**
   * The selected row (scrolled into view), plus `also` rows highlighted with it. A new object
   * each time something is picked, even the same row again.
   */
  selection?: { key: string; also?: string[] } | null
  onSelect: (target: TimelineTarget) => void
}

/** Sightings grouped by day, newest first. Stays show as one row. */
export function DayTimeline({ points, stays, selection, onSelect }: Props) {
  // React Compiler skips this component (TanStack Virtual returns unmemoizable functions),
  // so everything derived here is memoized by hand.
  const rows = useMemo(() => buildRows(points, stays), [points, stays])
  const scroller = useRef<HTMLDivElement>(null)

  const dayIndices = useMemo(
    () => rows.flatMap((row, i) => (row.type === "day" ? [i] : [])),
    [rows]
  )
  // Keep the heading of the day being scrolled through mounted, so it can stick to the top.
  const stickyFor = useCallback(
    (startIndex: number) => {
      let sticky = dayIndices[0] ?? 0
      for (const i of dayIndices) {
        if (i > startIndex) break
        sticky = i
      }
      return sticky
    },
    [dayIndices]
  )

  // Known: TanStack Virtual returns functions the compiler cannot memoize, which is why
  // everything derived in this component is memoized by hand.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: (i) =>
      rows[i].type === "day" ? ESTIMATE.day : ESTIMATE.entry,
    overscan: 12,
    rangeExtractor: useCallback(
      (range: { startIndex: number; endIndex: number; overscan: number }) => {
        const visible = new Set<number>([stickyFor(range.startIndex)])
        const start = Math.max(0, range.startIndex - range.overscan)
        const end = range.endIndex + range.overscan
        for (let i = start; i <= end; i++) visible.add(i)
        return [...visible].sort((a, b) => a - b)
      },
      [stickyFor]
    ),
  })

  const indexByKey = useMemo(() => {
    const byKey = new Map<string, number>()
    rows.forEach((row, i) => byKey.set(row.key, i))
    return byKey
  }, [rows])

  // Bring a row picked elsewhere (on the map) into view. `selection` is a fresh object every
  // pick, so picking the same row twice scrolls to it twice.
  const scrollToIndex = virtualizer.scrollToIndex
  useEffect(() => {
    if (!selection) return
    const index = indexByKey.get(selection.key)
    if (index != null) scrollToIndex(index, { align: "center" })
  }, [selection, indexByKey, scrollToIndex])

  if (points.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No sightings in this range</EmptyTitle>
          <EmptyDescription>
            Apple only reports an item while it is away from your own Apple
            devices, so quiet stretches are normal. Try a longer range, or wait
            for the next check.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const items = virtualizer.getVirtualItems()
  const sticky = virtualizer.range
    ? stickyFor(virtualizer.range.startIndex)
    : dayIndices[0]

  return (
    <ScrollArea className="min-h-0 flex-1" viewportRef={scroller}>
      <div
        className="relative w-full pr-3"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {items.map((item) => {
          const row = rows[item.index]
          const isSticky = item.index === sticky
          return (
            <div
              key={row.key}
              data-index={item.index}
              ref={virtualizer.measureElement}
              className={cn("left-0 w-full", isSticky ? "sticky" : "absolute")}
              style={
                isSticky
                  ? { top: 0, zIndex: 10 }
                  : { top: 0, transform: `translateY(${item.start}px)` }
              }
            >
              <Row
                row={row}
                highlighted={isHighlighted(selection, row.key)}
                onSelect={onSelect}
              />
            </div>
          )
        })}
      </div>
    </ScrollArea>
  )
}

function isHighlighted(selection: Props["selection"], key: string): boolean {
  return selection?.key === key || (selection?.also?.includes(key) ?? false)
}

function Row({
  row,
  highlighted,
  onSelect,
}: {
  row: TimelineRow
  highlighted: boolean
  onSelect: (target: TimelineTarget) => void
}) {
  if (row.type === "day") {
    return (
      <h3 className="flex justify-between bg-card py-1 text-xs font-medium text-muted-foreground">
        <span>{row.label}</span>
        <span>{row.reports}</span>
      </h3>
    )
  }
  if (row.type === "stay") {
    return (
      <StayRow
        stay={row.stay}
        rowKey={row.key}
        highlighted={highlighted}
        onSelect={onSelect}
      />
    )
  }
  return (
    <PointRow point={row.point} highlighted={highlighted} onSelect={onSelect} />
  )
}

const ROW =
  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"

function StayRow({
  stay,
  rowKey,
  highlighted,
  onSelect,
}: {
  stay: Stay
  rowKey: string
  highlighted: boolean
  onSelect: (target: TimelineTarget) => void
}) {
  return (
    <button
      type="button"
      onClick={() =>
        onSelect({
          latitude: stay.latitude,
          longitude: stay.longitude,
          key: rowKey,
        })
      }
      className={cn(ROW, "items-start", highlighted && "bg-primary/15")}
    >
      <MapPinnedIcon className="mt-0.5 size-3.5 shrink-0 text-primary" />
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
  highlighted,
  onSelect,
}: {
  point: Point
  highlighted: boolean
  onSelect: (target: TimelineTarget) => void
}) {
  const Icon = point.noise ? TriangleAlertIcon : MapPinIcon
  const button = (
    <button
      type="button"
      onClick={() =>
        onSelect({
          latitude: point.latitude,
          longitude: point.longitude,
          key: point.observed_at,
        })
      }
      className={cn(
        ROW,
        highlighted && "bg-primary/15",
        point.noise && "opacity-60"
      )}
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

  // The reason a report is judged unlikely is cut off in the row, so it needs to be reachable
  // by touch and keyboard too — a `title` is neither.
  if (!point.noise) return button
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="left" className="max-w-56">
        Hidden as unlikely: {NOISE[point.noise].toLowerCase()}.
      </TooltipContent>
    </Tooltip>
  )
}
