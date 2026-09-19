import { CheckIcon } from "lucide-react"

import { cn } from "~/lib/utils"

const STEPS = [
  "Before you start",
  "Apple ID",
  "Verify",
  "Unlock",
  "Choose",
] as const

/** Numbered dots for every step; only the current one is labelled, so it never wraps. */
export function StepIndicator({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-1.5 text-xs" aria-label="Progress">
      {STEPS.map((label, i) => {
        const done = i < current
        const active = i === current
        return (
          <li key={label} className="flex items-center gap-1.5">
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full border font-medium",
                done && "border-primary bg-primary text-primary-foreground",
                active && "border-primary text-foreground",
                !done && !active && "text-muted-foreground"
              )}
              aria-current={active ? "step" : undefined}
              title={label}
            >
              {done ? <CheckIcon className="size-3.5" /> : i + 1}
              <span className="sr-only">{label}</span>
            </span>
            {active && (
              <span className="font-medium whitespace-nowrap">{label}</span>
            )}
            {i < STEPS.length - 1 && (
              <span className="h-px w-3 bg-border sm:w-5" />
            )}
          </li>
        )
      })}
    </ol>
  )
}
