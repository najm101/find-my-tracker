import { api, unwrap } from "~/lib/api/client"

export function getRetention() {
  return unwrap(api.GET("/api/retention"))
}

/** What keeping `days` would delete right now. */
export function previewRetention(days: number) {
  return unwrap(
    api.GET("/api/retention/preview", { params: { query: { days } } })
  )
}

/** Keep history for `days`, or for good (null). */
export function setRetention(days: number | null) {
  return unwrap(api.PUT("/api/retention", { body: { days } }))
}
