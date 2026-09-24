import { ApiError, api, unwrap, type Schemas } from "~/lib/api/client"
import type { RoadRoutes } from "~/lib/road-routes"

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

/** History snapped to roads. `pending` trips are still being matched: ask again shortly. */
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
 * `getRoutes` for a loader that doesn't wait for it: history shows at once and the roads follow.
 * Matching can take a while. Nothing awaits this promise to catch a failure, so it never rejects:
 * a failure becomes an "unavailable" answer that says why.
 */
export function startRoutes(f: RouteFilters): Promise<RoadRoutes> {
  return getRoutes(f).catch((e: unknown): RoadRoutes => ({
    state: "unavailable",
    message:
      e instanceof ApiError ? e.message : "Couldn't load the road routes.",
    trips: [],
    pending: 0,
  }))
}
