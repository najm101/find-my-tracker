import type * as MapLibreGL from "maplibre-gl"
import { useEffect, useRef } from "react"

import { useMap } from "~/components/ui/map"

/**
 * Calls `onClick` with the clicked coordinate. Clicks on markers don't reach the map, and clicks
 * a layer has handled (`preventDefault`, e.g. picking a dot) are skipped.
 */
export function MapClick({
  onClick,
}: {
  onClick: (lat: number, lon: number) => void
}) {
  const { map, isLoaded } = useMap()
  const handler = useRef(onClick)
  useEffect(() => {
    handler.current = onClick
  }, [onClick])

  useEffect(() => {
    if (!map || !isLoaded) return
    const listener = (e: MapLibreGL.MapMouseEvent) =>
      // Every listener for this click has run by the time this microtask does, whatever order
      // they were added in.
      queueMicrotask(() => {
        if (!e.defaultPrevented) handler.current(e.lngLat.lat, e.lngLat.lng)
      })
    map.on("click", listener)
    map.getCanvas().style.cursor = "crosshair"
    return () => {
      map.off("click", listener)
      map.getCanvas().style.cursor = ""
    }
  }, [map, isLoaded])

  return null
}
