import { api, unwrap } from "~/lib/api/client"

export type HistoryFilters = {
  from: Date
  to: Date
  beaconIds?: number[]
  bbox?: string
}

function query(f: HistoryFilters) {
  return {
    from: f.from.toISOString(),
    to: f.to.toISOString(),
    ...(f.beaconIds?.length ? { beacon_id: f.beaconIds } : {}),
    ...(f.bbox ? { bbox: f.bbox } : {}),
  }
}

export function getLocations(filters: HistoryFilters, limit?: number) {
  return unwrap(
    api.GET("/api/locations", {
      params: { query: { ...query(filters), ...(limit ? { limit } : {}) } },
    })
  )
}

/** A download link for the current filters (the browser sends the session cookie). */
export function exportHref(
  filters: HistoryFilters,
  format: "csv" | "geojson"
): string {
  const params = new URLSearchParams({
    format,
    from: filters.from.toISOString(),
    to: filters.to.toISOString(),
  })
  for (const id of filters.beaconIds ?? [])
    params.append("beacon_id", String(id))
  if (filters.bbox) params.set("bbox", filters.bbox)
  return `/api/locations/export?${params}`
}
