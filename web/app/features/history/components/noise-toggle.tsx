import { EyeIcon, EyeOffIcon } from "lucide-react"

import { Button } from "~/components/ui/button"
import { Toggle } from "~/components/ui/toggle"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip"

type Props = {
  pressed: boolean
  hiddenCount: number
  onPressedChange: (pressed: boolean) => void
}

/**
 * Shows or hides the reports judged noisy. Hidden when there are none. `inline` makes it a link
 * that reads as part of a sentence ("12 unlikely hidden").
 */
export function NoiseToggle({
  pressed,
  hiddenCount,
  onPressedChange,
  inline = false,
}: Props & { inline?: boolean }) {
  if (hiddenCount === 0) return null
  const count = hiddenCount.toLocaleString()
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {inline ? (
          <Button
            variant="link"
            size="xs"
            aria-pressed={pressed}
            className="h-auto p-0 text-xs text-muted-foreground underline"
            onClick={() => onPressedChange(!pressed)}
          >
            {pressed
              ? `Hide the ${count} unlikely`
              : `${count} unlikely hidden`}
          </Button>
        ) : (
          <Toggle
            size="sm"
            variant="outline"
            pressed={pressed}
            onPressedChange={onPressedChange}
          >
            {pressed ? <EyeIcon /> : <EyeOffIcon />}
            {count} unlikely
          </Toggle>
        )}
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        Reports that are probably not where the item was: usually a passing
        phone that heard it from a distance.{" "}
        {pressed ? "Click to hide them." : "Click to show them."}
      </TooltipContent>
    </Tooltip>
  )
}
