import { CalendarIcon } from "lucide-react"
import { useState } from "react"
import type { DateRange } from "react-day-picker"

import { Button } from "~/components/ui/button"
import { Calendar } from "~/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover"
import { Separator } from "~/components/ui/separator"
import {
  RANGE_PRESETS,
  type RangePreset,
  type TimeRange,
  describeRange,
} from "~/lib/time-range"

type Props = {
  range: TimeRange
  onPreset: (preset: RangePreset) => void
  onCustom: (from: Date, to: Date) => void
}

export function RangePicker({ range, onPreset, onCustom }: Props) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DateRange | undefined>({
    from: range.from,
    to: range.to,
  })

  function apply() {
    if (!draft?.from) return
    const from = new Date(draft.from)
    from.setHours(0, 0, 0, 0)
    const to = new Date(draft.to ?? draft.from)
    to.setHours(23, 59, 59, 999)
    onCustom(from, to)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <CalendarIcon />
          {describeRange(range)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex flex-col sm:flex-row">
          <div className="flex flex-col gap-1 p-3 sm:w-40">
            {RANGE_PRESETS.map((p) => (
              <Button
                key={p.value}
                variant={range.preset === p.value ? "secondary" : "ghost"}
                size="sm"
                className="justify-start"
                onClick={() => {
                  onPreset(p.value)
                  setOpen(false)
                }}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <Separator orientation="vertical" className="hidden sm:block" />
          <div className="flex flex-col gap-2 p-3">
            <Calendar
              mode="range"
              selected={draft}
              onSelect={setDraft}
              numberOfMonths={1}
              disabled={{ after: new Date() }}
              defaultMonth={range.to}
            />
            <Button
              size="sm"
              onClick={apply}
              disabled={!draft?.from}
              className="self-end"
            >
              Show these days
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
