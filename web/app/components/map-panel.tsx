import type { ComponentProps } from "react"

import { cn } from "~/lib/utils"

/**
 * The surface for anything floating on the map: toolbars, control groups, status. Opaque enough
 * to read on every map style (satellite included), in light and dark.
 */
export function MapPanel({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "pointer-events-auto flex items-center gap-1.5 rounded-lg border bg-background/95 p-1.5 text-foreground shadow-sm backdrop-blur",
        className
      )}
      {...props}
    />
  )
}
