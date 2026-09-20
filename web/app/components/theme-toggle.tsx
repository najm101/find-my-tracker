import { LaptopIcon, MoonIcon, SunIcon } from "lucide-react"
import { useTheme } from "next-themes"
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group"

const THEMES = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "system", label: "System", icon: LaptopIcon },
]

/** Light / dark / follow the system. The map switches its style to match. */
export function ThemeToggle() {
  // next-themes only knows the stored choice once its provider has mounted. Until then this
  // is undefined and nothing is selected, which beats briefly showing the wrong one.
  const { theme, setTheme } = useTheme()

  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={theme ?? ""}
      onValueChange={(v) => v && setTheme(v)}
      aria-label="Colour theme"
    >
      {THEMES.map((t) => (
        <ToggleGroupItem key={t.value} value={t.value} aria-label={t.label}>
          <t.icon />
          {t.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
