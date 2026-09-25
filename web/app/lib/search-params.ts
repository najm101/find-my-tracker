/**
 * Map-view state kept in the URL: which beacons are hidden, latest vs history, whether history
 * includes the reports judged noisy, and whether its path follows roads.
 */

export type MapMode = "latest" | "history"

export function getMode(params: URLSearchParams): MapMode {
  return params.get("view") === "history" ? "history" : "latest"
}

export function withMode(
  params: URLSearchParams,
  mode: MapMode
): URLSearchParams {
  const next = new URLSearchParams(params)
  if (mode === "history") next.set("view", "history")
  else next.delete("view")
  return next
}

export function getHidden(params: URLSearchParams): Set<number> {
  return new Set(
    (params.get("hide") ?? "")
      .split(",")
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0)
  )
}

export function withHiddenToggled(
  params: URLSearchParams,
  id: number
): URLSearchParams {
  const hidden = getHidden(params)
  if (hidden.has(id)) hidden.delete(id)
  else hidden.add(id)
  const next = new URLSearchParams(params)
  if (hidden.size) next.set("hide", [...hidden].join(","))
  else next.delete("hide")
  return next
}

/** History shows only good reports unless `noise=show`. */
export function getShowNoise(params: URLSearchParams): boolean {
  return params.get("noise") === "show"
}

export function withShowNoise(
  params: URLSearchParams,
  show: boolean
): URLSearchParams {
  const next = new URLSearchParams(params)
  if (show) next.set("noise", "show")
  else next.delete("noise")
  return next
}

/** How history's path is drawn: as reported, as predicted routes, or both on top of each other. */
export type RouteMode = "reported" | "both" | "predicted"

export function getRouteMode(params: URLSearchParams): RouteMode {
  const value = params.get("route")
  if (value === "both") return value
  // "road": links saved when predicted routes were called road routes.
  return value === "predicted" || value === "road" ? "predicted" : "reported"
}

export function withRouteMode(
  params: URLSearchParams,
  mode: RouteMode
): URLSearchParams {
  const next = new URLSearchParams(params)
  if (mode === "reported") next.delete("route")
  else next.set("route", mode)
  return next
}
