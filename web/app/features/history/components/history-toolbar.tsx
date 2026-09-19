import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group"
import type { MapMode } from "~/lib/search-params"
import type { RangePreset, TimeRange } from "~/lib/time-range"

import type { HistoryFilters } from "../api/locations"
import { ExportMenu } from "./export-menu"
import { NoiseToggle } from "./noise-toggle"
import { RangePicker } from "./range-picker"

type Props = {
  mode: MapMode
  range: TimeRange
  filters: HistoryFilters
  pointCount?: number
  noisyCount?: number
  showNoise?: boolean
  truncated?: boolean
  onMode: (mode: MapMode) => void
  onPreset: (preset: RangePreset) => void
  onCustom: (from: Date, to: Date) => void
  onShowNoise?: (show: boolean) => void
}

/** Floating map toolbar: latest vs history, the time range, and export. */
export function HistoryToolbar({
  mode,
  range,
  filters,
  pointCount,
  noisyCount = 0,
  showNoise = false,
  truncated,
  onMode,
  onPreset,
  onCustom,
  onShowNoise,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-background/95 p-1.5 shadow-sm backdrop-blur">
      <ToggleGroup
        type="single"
        size="sm"
        variant="outline"
        value={mode}
        onValueChange={(v) => v && onMode(v as MapMode)}
      >
        <ToggleGroupItem value="latest">Latest</ToggleGroupItem>
        <ToggleGroupItem value="history">History</ToggleGroupItem>
      </ToggleGroup>
      {mode === "history" && (
        <>
          <RangePicker range={range} onPreset={onPreset} onCustom={onCustom} />
          <ExportMenu filters={filters} />
          {onShowNoise && (
            <NoiseToggle
              pressed={showNoise}
              hiddenCount={noisyCount}
              onPressedChange={onShowNoise}
            />
          )}
          {pointCount != null && (
            <span className="px-1 text-xs text-muted-foreground">
              {pointCount.toLocaleString()} point{pointCount === 1 ? "" : "s"}
              {truncated && " (limit reached, narrow the range)"}
            </span>
          )}
        </>
      )}
    </div>
  )
}
