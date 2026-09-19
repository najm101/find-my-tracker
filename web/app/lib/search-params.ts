/** Map-view state kept in the URL: which beacons are hidden, and latest vs history. */

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
