import { Spinner } from "~/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group"
import type { RouteMode } from "~/lib/search-params"
import { cn } from "~/lib/utils"

const MODES: { value: RouteMode; label: string; title: string }[] = [
  {
    value: "reported",
    label: "Reported",
    title: "Straight lines between the reports",
  },
  {
    value: "both",
    label: "Both",
    title: "The predicted route, over the reported path",
  },
  {
    value: "predicted",
    label: "Predicted",
    title: "Only the predicted route: the roads it most likely took",
  },
]

/** A sliver of the bar shows from the start, so it's clear something is under way. */
const MIN_FILL = 0.04

/**
 * How history's path is drawn: as reported, as its predicted route, or both. While the chosen
 * mode's routes are being found, its button fills up with `progress` (0..1), or shows a spinner
 * (`busy`) until that is known.
 */
export function RouteModeToggle({
  mode,
  busy = false,
  progress = null,
  onMode,
}: {
  mode: RouteMode
  busy?: boolean
  progress?: number | null
  onMode: (mode: RouteMode) => void
}) {
  return (
    <ToggleGroup
      type="single"
      size="sm"
      variant="outline"
      value={mode}
      onValueChange={(v) => v && onMode(v as RouteMode)}
      aria-label="Path"
      aria-busy={busy || progress !== null}
    >
      {MODES.map((m) => {
        const filling = m.value === mode && progress !== null
        const percent = Math.round((progress ?? 0) * 100)
        return (
          <ToggleGroupItem
            key={m.value}
            value={m.value}
            title={filling ? `${m.title} · ${percent}% found so far` : m.title}
            className={cn(filling && "relative overflow-hidden")}
          >
            {filling && (
              <span
                aria-hidden
                data-testid="route-progress"
                className="absolute inset-y-0 left-0 bg-primary/20 transition-[width] duration-700 ease-out"
                style={{
                  width: `${Math.max(progress ?? 0, MIN_FILL) * 100}%`,
                }}
              />
            )}
            {busy && m.value === mode && !filling && (
              <Spinner className="size-3" />
            )}
            <span className={cn(filling && "relative")}>{m.label}</span>
            {filling && <span className="sr-only">, {percent}% found</span>}
          </ToggleGroupItem>
        )
      })}
    </ToggleGroup>
  )
}
