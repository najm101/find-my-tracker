import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group"
import type { RouteMode } from "~/lib/search-params"

const MODES: { value: RouteMode; label: string; title: string }[] = [
  {
    value: "reported",
    label: "Reported",
    title: "Straight lines between the reports",
  },
  {
    value: "both",
    label: "Both",
    title: "The likely roads, over the reported path",
  },
  { value: "road", label: "Roads", title: "Only the likely roads" },
]

/** How history's path is drawn: as reported, along the likely roads, or both. */
export function RouteModeToggle({
  mode,
  onMode,
}: {
  mode: RouteMode
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
    >
      {MODES.map((m) => (
        <ToggleGroupItem key={m.value} value={m.value} title={m.title}>
          {m.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
