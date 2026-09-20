import { api, unwrap, type Schemas } from "~/lib/api/client"

export function getSettings() {
  return unwrap(api.GET("/api/settings"))
}

export function updateSettings(patch: Schemas["SettingsUpdate"]) {
  return unwrap(api.PATCH("/api/settings", { body: patch }))
}
