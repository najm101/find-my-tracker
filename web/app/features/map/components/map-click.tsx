import type * as MapLibreGL from "maplibre-gl"
import { useEffect, useRef } from "react"

import { useMap } from "~/components/ui/map"

/** Calls `onClick` with the clicked coordinate (clicks on markers don't reach the map). */
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
      handler.current(e.lngLat.lat, e.lngLat.lng)
    map.on("click", listener)
    map.getCanvas().style.cursor = "crosshair"
    return () => {
      map.off("click", listener)
      map.getCanvas().style.cursor = ""
    }
  }, [map, isLoaded])

  return null
}
