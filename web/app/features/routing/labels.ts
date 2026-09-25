import type { Schemas } from "~/lib/api/client"
import { bytes } from "~/lib/format"

type Region = Schemas["RegionOut"]

/** Where the setup guide lives: running the built-in engine, or a Valhalla container. */
export const ROUTING_GUIDE =
  "https://github.com/najm101/find-my-tracker#predicted-routes"

/** One line on where a map region is: downloading, waiting, ready, or why not. */
export function regionStatus(region: Region): string {
  const size = region.size_bytes ? bytes(region.size_bytes) : null
  switch (region.status) {
    case "queued":
      return "Waiting to download"
    case "downloading":
      return region.progress != null
        ? `Downloading · ${Math.round(region.progress * 100)}%${size ? ` of ${size}` : ""}`
        : "Downloading"
    case "downloaded":
      return region.in_use
        ? `Ready${size ? ` · ${size}` : ""}`
        : "Downloaded, waiting for the road data to be built"
    case "too_large":
      return `Too big to download automatically${size ? ` (${size})` : ""}`
    case "failed":
      return region.error ?? "The download failed"
  }
}

/** True while the engine is working: the page keeps itself up to date meanwhile. */
export function isBusy(builtin: Schemas["BuiltinOut"] | null): boolean {
  if (!builtin) return false
  return (
    builtin.phase !== "idle" ||
    builtin.regions.some(
      (r) => r.status === "queued" || r.status === "downloading"
    )
  )
}
