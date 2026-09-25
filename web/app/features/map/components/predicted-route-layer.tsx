import type * as MapLibreGL from "maplibre-gl"
import { useEffect, useId, useRef } from "react"

import { useMap } from "~/components/ui/map"
import { type PredictedTrip, routeLines, tripKey } from "~/lib/predicted-routes"

import { ARROW, arrowImage } from "./path-layer"

type Props = {
  trips: PredictedTrip[]
  colors: Map<number, string>
  selectedId?: number | null
  /** Drawn dimmed, as the backdrop to a playback. */
  faded?: boolean
  /** `tripKey`s of trips to draw in, start to end, when they first appear. */
  drawIn?: ReadonlySet<string>
}

/** How long drawing in one trip takes… */
const DRAW_MS = 1_200
/** …and how far apart trips arriving together start, oldest first. */
const STAGGER_MS = 300

const NONE: ReadonlySet<string> = new Set()

/**
 * History's predicted route: each trip along the roads it most likely took, with arrows. Dashed
 * where the way between two reports is not known; plain where no predicted route could be found.
 * A trip in `drawIn` is drawn in from its start the first time it shows, a dot at its head.
 */
export function PredictedRouteLayer({
  trips,
  colors,
  selectedId,
  faded = false,
  drawIn = NONE,
}: Props) {
  const { map, isLoaded } = useMap()
  const id = useId()
  const sourceId = `predicted-${id}`
  const drawingId = `predicted-drawing-${id}`
  const layers = {
    road: `predicted-line-${id}`,
    unknown: `predicted-unknown-${id}`,
    reported: `predicted-reported-${id}`,
    arrow: `predicted-arrow-${id}`,
    drawingRoad: `predicted-drawing-line-${id}`,
    drawingUnknown: `predicted-drawing-unknown-${id}`,
    drawingHead: `predicted-drawing-head-${id}`,
  }
  // Trips already shown (whole or being drawn in), and when each one being drawn in started.
  const seen = useRef(new Set<string>())
  const drawing = useRef(new Map<string, number>())
  const frame = useRef<number | null>(null)
  const latest = useRef({ trips, colors, selectedId, faded })

  useEffect(() => {
    if (!map || !isLoaded) return
    const empty: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [],
    }
    map.addSource(sourceId, { type: "geojson", data: empty })
    map.addSource(drawingId, { type: "geojson", data: empty })
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
    const isKind = (kind: string): MapLibreGL.FilterSpecification => [
      "==",
      ["get", "kind"],
      kind,
    ]
    for (const source of [sourceId, drawingId]) {
      const drawn = source === drawingId
      map.addLayer({
        id: drawn ? layers.drawingRoad : layers.road,
        type: "line",
        source,
        filter: isKind("road"),
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["get", "color"],
          "line-width": width,
          "line-opacity": opacity,
        },
      })
      map.addLayer({
        id: drawn ? layers.drawingUnknown : layers.unknown,
        type: "line",
        source,
        filter: isKind("unknown"),
        paint: {
          "line-color": ["get", "color"],
          "line-width": 3,
          "line-opacity": opacity,
          "line-dasharray": [1.5, 1.5],
        },
      })
    }
    map.addLayer({
      id: layers.reported,
      type: "line",
      source: sourceId,
      filter: isKind("reported"),
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
      filter: isKind("road"),
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
    map.addLayer({
      id: layers.drawingHead,
      type: "circle",
      source: drawingId,
      filter: isKind("head"),
      paint: {
        "circle-radius": 5,
        "circle-color": ["get", "color"],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
    })
    return () => {
      try {
        for (const layer of Object.values(layers).reverse())
          if (map.getLayer(layer)) map.removeLayer(layer)
        for (const source of [sourceId, drawingId])
          if (map.getSource(source)) map.removeSource(source)
      } catch {
        // style may be mid-reload
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- data is synced below
  }, [map, isLoaded, sourceId, drawingId])

  useEffect(() => {
    if (!map || !isLoaded) return
    latest.current = { trips, colors, selectedId, faded }
    // The arrows are drawn per colour; a style swap drops images, so this runs after each.
    for (const color of new Set(colors.values()))
      if (!map.hasImage(ARROW + color))
        map.addImage(ARROW + color, arrowImage(color), { pixelRatio: 2 })

    const still = prefersReducedMotion()
    let start = performance.now()
    const arrived = trips
      .filter((t) => !seen.current.has(tripKey(t)))
      .sort((a, b) => firstReport(a) - firstReport(b))
    for (const trip of arrived) {
      const key = tripKey(trip)
      seen.current.add(key)
      if (still || !drawIn.has(key)) continue
      drawing.current.set(key, start)
      start += STAGGER_MS
    }

    const source = (name: string) =>
      map.getSource(name) as MapLibreGL.GeoJSONSource | undefined
    const paintWhole = () => {
      const { trips, colors, selectedId, faded } = latest.current
      source(sourceId)?.setData(
        collection(
          trips.filter((t) => !drawing.current.has(tripKey(t))),
          (trip) => features(trip, 1, colors, selectedId, faded)
        )
      )
    }
    paintWhole()

    if (drawing.current.size === 0 || frame.current !== null) return
    const tick = (now: number) => {
      const { trips, colors, selectedId, faded } = latest.current
      const byKey = new Map(trips.map((t) => [tripKey(t), t]))
      const parts: GeoJSON.Feature[] = []
      let finished = false
      for (const [key, began] of drawing.current) {
        const trip = byKey.get(key)
        const f = (now - began) / DRAW_MS
        if (!trip || f >= 1) {
          drawing.current.delete(key)
          finished = true
        } else if (f > 0) {
          parts.push(...features(trip, ease(f), colors, selectedId, faded))
        }
      }
      source(drawingId)?.setData({ type: "FeatureCollection", features: parts })
      if (finished) paintWhole()
      frame.current = drawing.current.size ? requestAnimationFrame(tick) : null
    }
    frame.current = requestAnimationFrame(tick)
  }, [
    map,
    isLoaded,
    sourceId,
    drawingId,
    trips,
    colors,
    selectedId,
    faded,
    drawIn,
  ])

  // Unmounting mid-draw: stop, and forget what was being drawn so it shows whole next time.
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
      frame.current = null
      drawing.current.clear()
    },
    []
  )

  return null
}

function features(
  trip: PredictedTrip,
  upTo: number,
  colors: Map<number, string>,
  selectedId: number | null | undefined,
  faded: boolean
): GeoJSON.Feature[] {
  const lines = routeLines(trip, upTo)
  const properties = {
    color: colors.get(trip.beacon_id) ?? "#2563eb",
    dim: faded || (selectedId != null && trip.beacon_id !== selectedId),
    selected: trip.beacon_id === selectedId,
  }
  const out = (["road", "unknown", "reported"] as const).flatMap((kind) =>
    lines[kind].map((coordinates): GeoJSON.Feature => ({
      type: "Feature",
      geometry: { type: "LineString", coordinates },
      properties: { ...properties, kind },
    }))
  )
  if (lines.head)
    out.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: lines.head },
      properties: { ...properties, kind: "head" },
    })
  return out
}

function collection(
  trips: PredictedTrip[],
  toFeatures: (trip: PredictedTrip) => GeoJSON.Feature[]
): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: trips.flatMap(toFeatures) }
}

function firstReport(trip: PredictedTrip): number {
  return Date.parse(trip.reports[0]?.observed_at ?? "")
}

/** Slow at the ends, like a pen starting and stopping. */
function ease(f: number): number {
  return 0.5 - Math.cos(Math.PI * f) / 2
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  )
}
