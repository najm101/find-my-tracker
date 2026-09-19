import { EyeIcon, EyeOffIcon } from "lucide-react"

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

/** Shows or hides the reports judged noisy. Hidden when there are none. */
export function NoiseToggle({ pressed, hiddenCount, onPressedChange }: Props) {
  if (hiddenCount === 0) return null
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Toggle
          size="sm"
          variant="outline"
          pressed={pressed}
          onPressedChange={onPressedChange}
        >
          {pressed ? <EyeIcon /> : <EyeOffIcon />}
          {hiddenCount.toLocaleString()} unlikely
        </Toggle>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        Reports that are probably not where the item was: usually a passing
        phone that heard it from a distance.{" "}
        {pressed ? "Click to hide them." : "Click to show them."}
      </TooltipContent>
    </Tooltip>
  )
}
