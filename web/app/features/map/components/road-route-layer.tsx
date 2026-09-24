import type * as MapLibreGL from "maplibre-gl"
import { useEffect, useId } from "react"

import { useMap } from "~/components/ui/map"
import { type RoadTrip, roadLines } from "~/lib/road-routes"

import { ARROW, arrowImage } from "./path-layer"

type Props = {
  trips: RoadTrip[]
  colors: Map<number, string>
  selectedId?: number | null
  /** Drawn dimmed, as the backdrop to a playback. */
  faded?: boolean
}

/**
 * History snapped to roads: each trip along the roads it most likely took, with arrows. Dashed
 * where the way between two reports is not known; plain where no road route could be found.
 */
export function RoadRouteLayer({
  trips,
  colors,
  selectedId,
  faded = false,
}: Props) {
  const { map, isLoaded } = useMap()
  const id = useId()
  const sourceId = `road-${id}`
  const layers = {
    road: `road-line-${id}`,
    unknown: `road-unknown-${id}`,
    reported: `road-reported-${id}`,
    arrow: `road-arrow-${id}`,
  }

  useEffect(() => {
    if (!map || !isLoaded) return
    map.addSource(sourceId, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    })
    const width: MapLibreGL.ExpressionSpecification = [
      "case",
      ["get", "selected"],
      6,
      4,
    ]
    const opacity: MapLibreGL.ExpressionSpecification = [
      "case",
      ["get", "dim"],
      0.35,
      0.9,
    ]
    map.addLayer({
      id: layers.road,
      type: "line",
      source: sourceId,
      filter: ["==", ["get", "kind"], "road"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ["get", "color"],
        "line-width": width,
        "line-opacity": opacity,
      },
    })
    map.addLayer({
      id: layers.unknown,
      type: "line",
      source: sourceId,
      filter: ["==", ["get", "kind"], "unknown"],
      paint: {
        "line-color": ["get", "color"],
        "line-width": 3,
        "line-opacity": opacity,
        "line-dasharray": [1.5, 1.5],
      },
    })
    map.addLayer({
      id: layers.reported,
      type: "line",
      source: sourceId,
      filter: ["==", ["get", "kind"], "reported"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ["get", "color"],
        "line-width": 2.5,
        "line-opacity": ["case", ["get", "dim"], 0.3, 0.7],
      },
    })
    map.addLayer({
      id: layers.arrow,
      type: "symbol",
      source: sourceId,
      filter: ["==", ["get", "kind"], "road"],
      layout: {
        "symbol-placement": "line",
        "symbol-spacing": 120,
        "icon-image": ["concat", ARROW, ["get", "color"]],
        "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.75, 16, 1],
        "icon-rotation-alignment": "map",
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
      paint: { "icon-opacity": ["case", ["get", "dim"], 0.35, 1] },
    })
    return () => {
      try {
        for (const layer of Object.values(layers).reverse())
          if (map.getLayer(layer)) map.removeLayer(layer)
        if (map.getSource(sourceId)) map.removeSource(sourceId)
      } catch {
        // style may be mid-reload
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- data is synced below
  }, [map, isLoaded, sourceId])

  useEffect(() => {
    if (!map || !isLoaded) return
    // The arrows are drawn per colour; a style swap drops images, so this runs after each.
    for (const color of new Set(colors.values()))
      if (!map.hasImage(ARROW + color))
        map.addImage(ARROW + color, arrowImage(color), { pixelRatio: 2 })
    ;(map.getSource(sourceId) as MapLibreGL.GeoJSONSource | undefined)?.setData(
      toGeoJSON(trips, colors, selectedId, faded)
    )
  }, [map, isLoaded, sourceId, trips, colors, selectedId, faded])

  return null
}

function toGeoJSON(
  trips: RoadTrip[],
  colors: Map<number, string>,
  selectedId: number | null | undefined,
  faded: boolean
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: trips.flatMap((trip) => {
      const lines = roadLines(trip)
      const properties = {
        color: colors.get(trip.beacon_id) ?? "#2563eb",
        dim: faded || (selectedId != null && trip.beacon_id !== selectedId),
        selected: trip.beacon_id === selectedId,
      }
      return (["road", "unknown", "reported"] as const).flatMap((kind) =>
        lines[kind].map((coordinates): GeoJSON.Feature => ({
          type: "Feature",
          geometry: { type: "LineString", coordinates },
          properties: { ...properties, kind },
        }))
      )
    }),
  }
}
