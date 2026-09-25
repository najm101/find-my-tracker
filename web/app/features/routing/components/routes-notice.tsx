import { ExternalLinkIcon, InfoIcon } from "lucide-react"
import { Link } from "react-router"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import type { PredictedRoutes } from "~/lib/predicted-routes"
import { cn } from "~/lib/utils"

import { ROUTING_GUIDE } from "../labels"

/**
 * What stands between history and its predicted routes, if anything: routing not set up, the
 * engine busy or unreachable, or trips with no roads in the map data. How far along finding them
 * is shows on the path toggle, not here.
 */
export function RoutesNotice({
  routes,
  className,
}: {
  routes: PredictedRoutes | undefined
  className?: string
}) {
  if (!routes) return null
  const noRoads = routes.trips.filter((t) => t.fallback === "no_roads").length

  if (routes.state === "off" || routes.state === "unavailable") {
    const off = routes.state === "off"
    return (
      <Alert className={cn("pointer-events-auto", className)}>
        <InfoIcon />
        <AlertTitle>
          {off
            ? "Predicted routes aren't set up"
            : "Predicted routes aren't available"}
        </AlertTitle>
        <AlertDescription>
          <p>
            {off
              ? "They need a routing engine: the built-in one, or a Valhalla server of your own."
              : routes.message}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/settings/predicted-routes">
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
        <Link to="/settings/predicted-routes" className="underline">
          Map data
        </Link>
      </p>
    )
  }
  return null
}
