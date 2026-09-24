import { ExternalLinkIcon, InfoIcon } from "lucide-react"
import { useEffect, useRef } from "react"
import { Link, useRevalidator } from "react-router"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import { Spinner } from "~/components/ui/spinner"
import type { RoadRoutes } from "~/lib/road-routes"
import { cn } from "~/lib/utils"

import { ROUTING_GUIDE } from "../labels"

/** Trips still being matched are asked for again after this long. */
const PENDING_RETRY_MS = 2_000

/**
 * What stands between history and its road routes, if anything: routing not set up, the engine
 * busy or unreachable, trips still being matched, or trips with no roads in the map data.
 */
export function RoutesNotice({
  routes,
  className,
}: {
  routes: RoadRoutes
  className?: string
}) {
  useRetryWhile(routes.pending > 0, routes)
  const noRoads = routes.trips.filter((t) => t.fallback === "no_roads").length

  if (routes.state === "off" || routes.state === "unavailable") {
    const off = routes.state === "off"
    return (
      <Alert className={cn("pointer-events-auto", className)}>
        <InfoIcon />
        <AlertTitle>
          {off ? "Road routes aren't set up" : "Road routes aren't available"}
        </AlertTitle>
        <AlertDescription>
          <p>
            {off
              ? "They need a routing engine: the built-in one, or a Valhalla server of your own."
              : routes.message}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/settings#road-routes">
                {off ? "Set up" : "Settings"}
              </Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <a href={ROUTING_GUIDE} target="_blank" rel="noreferrer">
                Guide
                <ExternalLinkIcon />
              </a>
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    )
  }
  if (routes.pending > 0) {
    return (
      <p
        className={cn(
          "pointer-events-auto flex items-center gap-2 text-xs text-muted-foreground",
          className
        )}
      >
        <Spinner className="size-3" />
        Finding the roads for {routes.pending} more trip
        {routes.pending === 1 ? "" : "s"}…
      </p>
    )
  }
  if (noRoads > 0) {
    return (
      <p
        className={cn(
          "pointer-events-auto text-xs text-muted-foreground",
          className
        )}
      >
        {noRoads} trip{noRoads === 1 ? " has" : "s have"} no roads nearby in the
        map data, so {noRoads === 1 ? "it's" : "they're"} drawn as reported.{" "}
        <Link to="/settings#road-routes" className="underline">
          Map data
        </Link>
      </p>
    )
  }
  return null
}

/** Load the page again shortly, after each answer that still has trips being matched. */
function useRetryWhile(active: boolean, answer: unknown) {
  const revalidator = useRevalidator()
  const revalidate = useRef(revalidator.revalidate)
  useEffect(() => {
    revalidate.current = revalidator.revalidate
  })
  useEffect(() => {
    if (!active) return
    const id = setTimeout(() => void revalidate.current(), PENDING_RETRY_MS)
    return () => clearTimeout(id)
  }, [active, answer])
}
