/**
 * Drawing a trip's road route (see the server's `features/routing`): along the roads where the
 * route is known, a dashed straight line where it breaks, and the reports themselves when no road
 * route could be found.
 */

import type { Schemas } from "~/lib/api/client"
import { type LngLat, measure, slice } from "~/lib/geometry"

/**
 * A trip's road route. Its geometry is loosened to `number[][]`: route loader data comes through
 * React Router's serialisation types, which drop the [longitude, latitude] tuple.
 */
export type RoadTrip = Omit<Schemas["TripRoute"], "geometry"> & {
  geometry: number[][]
}

/** The answer to a history view's request for road routes. */
export type RoadRoutes = Omit<Schemas["RoutesResponse"], "trips"> & {
  trips: RoadTrip[]
}

export type RoadLines = {
  /** Along the roads. */
  road: LngLat[][]
  /** The way between two reports is not known: straight, to be drawn dashed. */
  unknown: LngLat[][]
  /** No road route for the trip: its reports joined up, as the reported path draws them. */
  reported: LngLat[][]
}

export function roadLines(route: RoadTrip): RoadLines {
  const at = route.reports.map((r): LngLat => [r.longitude, r.latitude])
  if (route.fallback || route.geometry.length < 2) {
    return { road: [], unknown: [], reported: at.length > 1 ? [at] : [] }
  }
  const line = route.geometry as LngLat[]
  const along = measure(line)
  const broken = new Set(route.broken_after)
  const road: LngLat[][] = []
  const unknown: LngLat[][] = []
  let run: LngLat[] | null = null
  for (let k = 0; k + 1 < route.reports.length; k++) {
    if (broken.has(k)) {
      unknown.push([at[k], at[k + 1]])
      run = null
      continue
    }
    const part = slice(
      line,
      along,
      route.reports[k].offset_m,
      route.reports[k + 1].offset_m
    )
    if (run) run.push(...part.slice(1))
    else {
      run = part
      road.push(run)
    }
  }
  return { road, unknown, reported: [] }
}

/** A key for a report, the same from history and from a road route. */
export function reportKey(beaconId: number, observedAt: string): string {
  return `${beaconId}|${Date.parse(observedAt)}`
}

/** Reports a road route left off the route: probably a finder on a nearby road. */
export function offRouteKeys(routes: RoadTrip[]): Set<string> {
  const keys = new Set<string>()
  for (const route of routes)
    for (const r of route.reports)
      if (r.off_route) keys.add(reportKey(route.beacon_id, r.observed_at))
  return keys
}
