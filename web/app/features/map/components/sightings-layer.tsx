import type * as MapLibreGL from "maplibre-gl"
import { useEffect, useId, useMemo } from "react"

import { useMap } from "~/components/ui/map"
import type { Schemas } from "~/lib/api/client"

type Point = Schemas["LocationPoint"]

/**
 * Every sighting as a small dot, coloured per beacon; noisy ones faint. A single circle layer,
 * because thousands of DOM markers would be far too slow.
 */
export function SightingsLayer({
  points,
  colors,
}: {
  points: Point[]
  colors: Map<number, string>
}) {
  const { map, isLoaded } = useMap()
  const id = useId()
  const sourceId = `sightings-${id}`
  const layerId = `sightings-layer-${id}`

  const data = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: points.map((p) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.longitude, p.latitude] },
        properties: {
          color: colors.get(p.beacon_id) ?? "#2563eb",
          noisy: p.noise != null,
        },
      })),
    }),
    [points, colors]
  )

  useEffect(() => {
    if (!map || !isLoaded) return
    map.addSource(sourceId, { type: "geojson", data })
    map.addLayer({
      id: layerId,
      type: "circle",
      source: sourceId,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 2, 16, 5],
        "circle-color": ["get", "color"],
        "circle-opacity": ["case", ["get", "noisy"], 0.3, 0.85],
        "circle-stroke-width": ["case", ["get", "noisy"], 0, 1],
        "circle-stroke-color": "#ffffff",
      },
    })
    return () => {
      try {
        if (map.getLayer(layerId)) map.removeLayer(layerId)
        if (map.getSource(sourceId)) map.removeSource(sourceId)
      } catch {
        // style may be mid-reload
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- data is synced below
  }, [map, isLoaded, sourceId, layerId])

  useEffect(() => {
    if (!map || !isLoaded) return
    ;(map.getSource(sourceId) as MapLibreGL.GeoJSONSource | undefined)?.setData(
      data
    )
  }, [map, isLoaded, sourceId, data])

  return null
}
