import { api, unwrap } from "~/lib/api/client"

export function getTrackingStatus() {
  return unwrap(api.GET("/api/tracking/status"))
}

export function refreshNow() {
  return unwrap(api.POST("/api/tracking/refresh"))
}

export function listPollRuns(limit = 50) {
  return unwrap(api.GET("/api/tracking/runs", { params: { query: { limit } } }))
}
