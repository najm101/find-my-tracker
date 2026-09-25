import type * as MapLibreGL from "maplibre-gl"
import { useEffect, useId, useMemo, useRef } from "react"

import { useMap } from "~/components/ui/map"
import type { Schemas } from "~/lib/api/client"
import { reportKey } from "~/lib/predicted-routes"

type Point = Schemas["LocationPoint"]

/**
 * Every sighting as a small dot, coloured per beacon; noisy ones faint, and ones a predicted route left
 * off the route hollow. A single circle layer, because thousands of DOM markers would be far too
 * slow. Dots are clickable when `onPick` is set.
 */
export function SightingsLayer({
  points,
  colors,
  faded = false,
  offRoute,
  onPick,
}: {
  points: Point[]
  colors: Map<number, string>
  /** Draw every dot faint, as the backdrop to a playback. */
  faded?: boolean
  /** `reportKey`s of reports off the predicted route. */
  offRoute?: Set<string>
  onPick?: (point: Point) => void
}) {
  const { map, isLoaded } = useMap()
  const id = useId()
  const sourceId = `sightings-${id}`
  const layerId = `sightings-layer-${id}`

  const data = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: points.map((p, i) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.longitude, p.latitude] },
        properties: {
          index: i,
          color: colors.get(p.beacon_id) ?? "#2563eb",
          faint: faded || p.noise != null,
          off: offRoute?.has(reportKey(p.beacon_id, p.observed_at)) ?? false,
        },
      })),
    }),
    [points, colors, faded, offRoute]
  )

  useEffect(() => {
    if (!map || !isLoaded) return
    map.addSource(sourceId, { type: "geojson", data })
    map.addLayer({
      id: layerId,
      type: "circle",
      source: sourceId,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 2.5, 16, 6],
        // Off the route: hollow, a ring in the item's colour.
        "circle-color": ["case", ["get", "off"], "#ffffff", ["get", "color"]],
        "circle-opacity": ["case", ["get", "faint"], 0.3, 0.85],
        "circle-stroke-width": [
          "case",
          ["get", "off"],
          2,
          ["get", "faint"],
          0,
          1,
        ],
        "circle-stroke-color": [
          "case",
          ["get", "off"],
          ["get", "color"],
          "#ffffff",
        ],
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

  // Latest values for the click handler, without re-binding it on every render.
  const pick = useRef({ onPick, points })
  useEffect(() => {
    pick.current = { onPick, points }
  })

  useEffect(() => {
    if (!map || !isLoaded || !onPick) return
    const click = (e: MapLibreGL.MapLayerMouseEvent) => {
      const index = e.features?.[0]?.properties?.index
      const point =
        typeof index === "number" ? pick.current.points[index] : undefined
      if (point) pick.current.onPick?.(point)
    }
    const enter = () => (map.getCanvas().style.cursor = "pointer")
    const leave = () => (map.getCanvas().style.cursor = "")
    map.on("click", layerId, click)
    map.on("mouseenter", layerId, enter)
    map.on("mouseleave", layerId, leave)
    return () => {
      map.off("click", layerId, click)
      map.off("mouseenter", layerId, enter)
      map.off("mouseleave", layerId, leave)
      leave()
    }
  }, [map, isLoaded, layerId, onPick != null]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}
