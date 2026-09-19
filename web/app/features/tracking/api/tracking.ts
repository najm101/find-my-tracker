import { api, unwrap } from "~/lib/api/client"

export function getTrackingStatus() {
  return unwrap(api.GET("/api/tracking/status"))
}

export function refreshNow() {
  return unwrap(api.POST("/api/tracking/refresh"))
}
