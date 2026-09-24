import { PlayIcon } from "lucide-react"
import type { ReactNode } from "react"

import { MapPanel } from "~/components/map-panel"
import { Button } from "~/components/ui/button"
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
  /** When the page's data was loaded. */
  now: number
  filters: HistoryFilters
  pointCount?: number
  noisyCount?: number
  showNoise?: boolean
  truncated?: boolean
  onMode: (mode: MapMode) => void
  onPreset: (preset: RangePreset) => void
  onCustom: (from: Date, to: Date) => void
  onShowNoise?: (show: boolean) => void
  /** Play the range back; the button is disabled without `canPlay`. */
  onPlay?: () => void
  canPlay?: boolean
  /** More history controls, after the range (e.g. how the path is drawn). */
  extra?: ReactNode
}

/** Floating map toolbar: latest vs history, the time range, playback and export. */
export function HistoryToolbar({
  mode,
  range,
  now,
  filters,
  pointCount,
  noisyCount = 0,
  showNoise = false,
  truncated,
  onMode,
  onPreset,
  onCustom,
  onShowNoise,
  onPlay,
  canPlay = false,
  extra,
}: Props) {
  return (
    <MapPanel className="flex-wrap">
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
          <RangePicker
            range={range}
            now={now}
            onPreset={onPreset}
            onCustom={onCustom}
          />
          {extra}
          {onPlay && (
            <Button
              variant="outline"
              size="sm"
              disabled={!canPlay}
              onClick={onPlay}
            >
              <PlayIcon />
              {/* A phone has little room up here: the icon says it. */}
              <span className="max-sm:sr-only">Play</span>
            </Button>
          )}
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
    </MapPanel>
  )
}
