import * as MapLibreGL from "maplibre-gl"
import { useEffect } from "react"

import { useMap } from "~/components/ui/map"

/** Frame the given coordinates whenever `fitKey` changes. */
export function FitToData({
  coordinates,
  fitKey,
}: {
  coordinates: [number, number][]
  fitKey: string
}) {
  const { map, isLoaded } = useMap()

  useEffect(() => {
    if (!map || !isLoaded || coordinates.length === 0) return
    if (coordinates.length === 1) {
      map.flyTo({ center: coordinates[0], zoom: 15, duration: 600 })
      return
    }
    const bounds = coordinates.reduce(
      (b, c) => b.extend(c),
      new MapLibreGL.LngLatBounds(coordinates[0], coordinates[0])
    )
    map.fitBounds(bounds, { padding: 72, maxZoom: 16, duration: 600 })
    // Only refit when the caller says the data set changed, not on every poll refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, isLoaded, fitKey])

  return null
}
