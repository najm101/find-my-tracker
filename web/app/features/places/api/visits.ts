import { api, unwrap } from "~/lib/api/client"

export type VisitQuery = {
  lat: number
  lon: number
  radiusM: number
  from: Date
  to: Date
}

export function getVisits(q: VisitQuery) {
  return unwrap(
    api.GET("/api/locations/visits", {
      params: {
        query: {
          lat: q.lat,
          lon: q.lon,
          radius_m: q.radiusM,
          from: q.from.toISOString(),
          to: q.to.toISOString(),
        },
      },
    })
  )
}
