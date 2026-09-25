import { ApiError, api, unwrap, type Schemas } from "~/lib/api/client"
import type { PredictedRoutes } from "~/lib/predicted-routes"

export function getRouting() {
  return unwrap(api.GET("/api/routing"))
}

export function updateRouting(body: Schemas["RoutingUpdate"]) {
  return unwrap(api.PUT("/api/routing", { body }))
}

export function setAutoDownload(enabled: boolean) {
  return unwrap(api.PUT("/api/routing/auto-download", { body: { enabled } }))
}

export function getRegionCatalog() {
  return unwrap(api.GET("/api/routing/regions/catalog"))
}

export function addRegion(id: string) {
  return unwrap(api.POST("/api/routing/regions", { body: { id } }))
}

export function removeRegion(id: string) {
  return unwrap(
    api.DELETE("/api/routing/regions/{region_id}", {
      params: { path: { region_id: id } },
    })
  )
}

export function refreshRegions() {
  return unwrap(api.POST("/api/routing/regions/refresh"))
}

export function deleteMapData() {
  return unwrap(api.DELETE("/api/routing/data"))
}

export type RouteFilters = { from: Date; to: Date; beaconIds?: number[] }

/**
 * History's predicted routes. Trips still being matched come later: `progress` says how far along
 * that is, and `getRoutesJob` fetches them.
 */
export function getRoutes(f: RouteFilters) {
  return unwrap(
    api.GET("/api/routing/routes", {
      params: {
        query: {
          from: f.from.toISOString(),
          to: f.to.toISOString(),
          ...(f.beaconIds?.length ? { beacon_id: f.beaconIds } : {}),
        },
      },
    })
  )
}

/**
 * `getRoutes` for a loader that doesn't wait for it: history shows at once and the routes follow.
 * Nothing awaits this promise to catch a failure, so it never rejects: a failure becomes an
 * "unavailable" answer that says why.
 */
export function startRoutes(f: RouteFilters): Promise<PredictedRoutes> {
  return getRoutes(f).catch((e: unknown): PredictedRoutes => ({
    state: "unavailable",
    message:
      e instanceof ApiError ? e.message : "Couldn't load the predicted routes.",
    trips: [],
    progress: null,
  }))
}

/**
 * The trips a matching job has matched since the first `after`, and how far along it is. Null
 * once the job is gone: nobody asked about it for a while (the page slept), so start again.
 */
export async function getRoutesJob(
  job: string,
  after: number
): Promise<PredictedRoutes | null> {
  try {
    return await unwrap(
      api.GET("/api/routing/routes/jobs/{job_id}", {
        params: { path: { job_id: job }, query: { after } },
      })
    )
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null
    throw e
  }
}
