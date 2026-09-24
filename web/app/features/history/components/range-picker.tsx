import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { useId, useState } from "react"
import type { DateRange } from "react-day-picker"

import { Button } from "~/components/ui/button"
import { Calendar } from "~/components/ui/calendar"
import { Field, FieldLabel } from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover"
import { Separator } from "~/components/ui/separator"
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group"
import {
  RANGE_PRESETS,
  type RangePreset,
  type TimeRange,
  describeRange,
  isLatest,
  shiftRange,
} from "~/lib/time-range"
import { cn } from "~/lib/utils"

type Props = {
  range: TimeRange
  /** When the page's data was loaded: a later window exists only before this. */
  now: number
  onPreset: (preset: RangePreset) => void
  onCustom: (from: Date, to: Date) => void
  /** Stretch across its container: the window button takes the room between the arrows. */
  fill?: boolean
}

/**
 * The history window: a "last …" preset, or days and times of your own. The arrows beside it
 * step to the window of the same length before or after.
 */
export function RangePicker({
  range,
  now,
  onPreset,
  onCustom,
  fill = false,
}: Props) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [days, setDays] = useState<DateRange | undefined>()
  const [fromTime, setFromTime] = useState("00:00")
  const [toTime, setToTime] = useState("23:59")

  const from = days?.from && withTime(days.from, fromTime)
  const to = days?.from && withTime(days.to ?? days.from, toTime, true)
  const backwards = from && to ? from >= to : false

  // Open on the window being shown, so it can be adjusted rather than rebuilt.
  function openChange(next: boolean) {
    if (next) {
      setDays({ from: range.from, to: range.to })
      setFromTime(clockTime(range.from))
      setToTime(clockTime(range.to))
    }
    setOpen(next)
  }

  function apply() {
    if (!from || !to || backwards) return
    onCustom(from, to)
    setOpen(false)
  }

  function shift(direction: -1 | 1) {
    const next = shiftRange(range, direction, new Date())
    if ("preset" in next) onPreset(next.preset)
    else onCustom(next.from, next.to)
  }

  return (
    <div className={cn("flex items-center gap-0.5", fill && "w-full")}>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Earlier"
        title="The window before this one"
        onClick={() => shift(-1)}
      >
        <ChevronLeftIcon />
      </Button>
      <Popover open={open} onOpenChange={openChange}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(fill && "min-w-0 flex-1")}
          >
            <CalendarIcon />
            {describeRange(range)}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="flex w-auto flex-col gap-3 p-3"
          align="start"
        >
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">Last</p>
            <ToggleGroup
              type="single"
              size="sm"
              variant="outline"
              spacing={1}
              className="flex-wrap"
              value={range.preset === "custom" ? "" : range.preset}
              onValueChange={(v) => {
                if (v) onPreset(v as RangePreset)
                setOpen(false)
              }}
            >
              {RANGE_PRESETS.map((p) => (
                <ToggleGroupItem
                  key={p.value}
                  value={p.value}
                  aria-label={p.label}
                >
                  {p.short}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <Separator />
          <Calendar
            mode="range"
            selected={days}
            onSelect={setDays}
            numberOfMonths={1}
            disabled={{ after: new Date(now) }}
            defaultMonth={range.to}
            className="p-0"
          />
          <div className="grid grid-cols-2 gap-2">
            <Field className="gap-1.5">
              <FieldLabel htmlFor={`${id}-from`}>From</FieldLabel>
              <Input
                id={`${id}-from`}
                type="time"
                value={fromTime}
                onChange={(e) => setFromTime(e.target.value)}
              />
            </Field>
            <Field className="gap-1.5">
              <FieldLabel htmlFor={`${id}-to`}>To</FieldLabel>
              <Input
                id={`${id}-to`}
                type="time"
                value={toTime}
                onChange={(e) => setToTime(e.target.value)}
              />
            </Field>
          </div>
          {backwards && (
            <p className="text-xs text-destructive">
              The start has to be before the end.
            </p>
          )}
          <Button
            size="sm"
            onClick={apply}
            disabled={!from || !to || backwards}
            className="self-end"
          >
            Show this window
          </Button>
        </PopoverContent>
      </Popover>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Later"
        title="The window after this one"
        disabled={isLatest(range, new Date(now))}
        onClick={() => shift(1)}
      >
        <ChevronRightIcon />
      </Button>
    </div>
  )
}

/** "09:05", as a time field holds it. */
function clockTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * `day` at the time a field holds. An end of 23:59 means the end of the day, so that day's last
 * minute is included.
 */
function withTime(day: Date, hhmm: string, end = false): Date {
  const [h, m] = hhmm.split(":").map(Number)
  const d = new Date(day)
  d.setHours(h || 0, m || 0, 0, 0)
  if (end && h === 23 && m === 59) d.setSeconds(59, 999)
  return d
}
