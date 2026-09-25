/**
 * Which sightings are inside a place's circle, and which visit each belongs to (the server groups
 * them into visits; see `features/locations` there).
 */

import type { Schemas } from "~/lib/api/client"
import { metresBetween } from "~/lib/geometry"
import { reportKey } from "~/lib/predicted-routes"

type Point = Schemas["LocationPoint"]
type Visit = Schemas["Visit"]

export type Place = { lat: number; lon: number }

/** A visit's name in the URL: its item and when it arrived. */
export function visitKey(v: Visit): string {
  return `${v.beacon_id}@${Date.parse(v.arrived_at)}`
}

export function sightingsInside(
  points: Point[],
  place: Place,
  radiusM: number
): Point[] {
  const centre = { latitude: place.lat, longitude: place.lon }
  return points.filter((p) => metresBetween(centre, p) <= radiusM)
}

/** Whether a sighting inside the circle is one of the visit's. */
export function inVisit(p: Point, v: Visit): boolean {
  const t = Date.parse(p.observed_at)
  return (
    p.beacon_id === v.beacon_id &&
    t >= Date.parse(v.arrived_at) &&
    t <= Date.parse(v.left_at)
  )
}

/** The `reportKey`s to highlight: every sighting inside, or only the chosen visit's. */
export function highlightKeys(
  inside: Point[],
  visit: Visit | null
): Set<string> {
  return new Set(
    inside
      .filter((p) => !visit || inVisit(p, visit))
      .map((p) => reportKey(p.beacon_id, p.observed_at))
  )
}
