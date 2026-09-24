import { Spinner } from "~/components/ui/spinner"
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

/**
 * How history's path is drawn: as reported, along the likely roads, or both. `busy` puts a
 * spinner on the chosen mode while its roads are being found.
 */
export function RouteModeToggle({
  mode,
  busy = false,
  onMode,
}: {
  mode: RouteMode
  busy?: boolean
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
      aria-busy={busy}
    >
      {MODES.map((m) => (
        <ToggleGroupItem key={m.value} value={m.value} title={m.title}>
          {busy && m.value === mode && <Spinner className="size-3" />}
          {m.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
