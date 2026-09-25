/**
 * Drawing a trip's predicted route (see the server's `features/routing`): along the roads where
 * the route is known, a dashed straight line where it breaks, and the reports themselves when no
 * predicted route could be found.
 */

import type { Schemas } from "~/lib/api/client"
import { type LngLat, measure, slice } from "~/lib/geometry"

/**
 * A trip's predicted route. Its geometry is loosened to `number[][]`: route loader data comes
 * through React Router's serialisation types, which drop the [longitude, latitude] tuple.
 */
export type PredictedTrip = Omit<Schemas["TripRoute"], "geometry"> & {
  geometry: number[][]
}

/** The answer to a history view's request for predicted routes. */
export type PredictedRoutes = Omit<Schemas["RoutesResponse"], "trips"> & {
  trips: PredictedTrip[]
}

export type RouteLines = {
  /** Along the roads. */
  road: LngLat[][]
  /** The way between two reports is not known: straight, to be drawn dashed. */
  unknown: LngLat[][]
  /** No predicted route for the trip: its reports joined up, as the reported path draws them. */
  reported: LngLat[][]
  /** How far a trip partly drawn has got; null when it is drawn whole. */
  head: LngLat | null
}

/**
 * The lines to draw for a trip: all of it, or while it is being drawn in, its first `upTo`
 * (0..1, by distance along the route). A trip without a route is always drawn whole.
 */
export function routeLines(route: PredictedTrip, upTo = 1): RouteLines {
  const at = route.reports.map((r): LngLat => [r.longitude, r.latitude])
  if (route.fallback || route.geometry.length < 2) {
    return {
      road: [],
      unknown: [],
      reported: at.length > 1 ? [at] : [],
      head: null,
    }
  }
  const line = route.geometry as LngLat[]
  const along = measure(line)
  const broken = new Set(route.broken_after)
  const offsets = route.reports.map((r) => r.offset_m)
  const whole = upTo >= 1
  const until = whole
    ? Number.POSITIVE_INFINITY
    : offsets[0] +
      (offsets[offsets.length - 1] - offsets[0]) * Math.max(0, upTo)
  const road: LngLat[][] = []
  const unknown: LngLat[][] = []
  let run: LngLat[] | null = null
  let head: LngLat | null = whole ? null : at[0]
  for (let k = 0; k + 1 < route.reports.length; k++) {
    const from = offsets[k]
    const to = offsets[k + 1]
    // How much of the way from report k to the next is drawn.
    const shown = to <= until ? 1 : (until - from) / (to - from)
    if (shown <= 0) break
    let part: LngLat[]
    if (broken.has(k)) {
      part = [at[k], shown < 1 ? lerp(at[k], at[k + 1], shown) : at[k + 1]]
      unknown.push(part)
      run = null
    } else {
      part = slice(line, along, from, from + (to - from) * shown)
      if (run) run.push(...part.slice(1))
      else {
        run = part
        road.push(run)
      }
    }
    if (!whole) head = part[part.length - 1]
    if (shown < 1) break
  }
  return { road, unknown, reported: [], head }
}

function lerp(a: LngLat, b: LngLat, f: number): LngLat {
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]
}

/** A key for a report, the same from history and from a predicted route. */
export function reportKey(beaconId: number, observedAt: string): string {
  return `${beaconId}|${Date.parse(observedAt)}`
}

/** A key for a trip: its beacon and its first report. */
export function tripKey(route: PredictedTrip): string {
  return reportKey(route.beacon_id, route.reports[0]?.observed_at ?? "")
}

/** Reports a predicted route left off the route: probably a finder on a nearby road. */
export function offRouteKeys(routes: PredictedTrip[]): Set<string> {
  const keys = new Set<string>()
  for (const route of routes)
    for (const r of route.reports)
      if (r.off_route) keys.add(reportKey(route.beacon_id, r.observed_at))
  return keys
}

/** Every report on a trip that has its predicted route: the route draws the way between them. */
export function coveredKeys(routes: PredictedTrip[]): Set<string> {
  const keys = new Set<string>()
  for (const route of routes)
    for (const r of route.reports)
      keys.add(reportKey(route.beacon_id, r.observed_at))
  return keys
}
