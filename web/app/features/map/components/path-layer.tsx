import type * as MapLibreGL from "maplibre-gl"
import { useEffect, useId, useMemo, useRef, useState } from "react"

import { MapPopup, useMap } from "~/components/ui/map"
import type { Schemas } from "~/lib/api/client"
import { distance, duration, time } from "~/lib/format"

type Point = Schemas["LocationPoint"]

/** Longer than this between two reports, and the line says nothing about how it was travelled. */
const GAP_S = 30 * 60
/** Shorter segments (the jitter inside a stay) get no arrow. */
const ARROW_MIN_M = 40
const ARROW = "fmt-path-arrow-"

export type Segment = {
  from: Point
  to: Point
  seconds: number
  meters: number
}

type Props = {
  /** Good reports only, ordered by beacon then time. */
  points: Point[]
  colors: Map<number, string>
  selectedId?: number | null
  /** Called when a segment is clicked, besides showing its popup. */
  onPick?: (segment: Segment) => void
}

/**
 * Each beacon's path as segments between consecutive reports, with arrows pointing from the
 * older report to the newer one. A segment is clickable: a popup tells how long it took.
 */
export function PathLayer({ points, colors, selectedId, onPick }: Props) {
  const { map, isLoaded } = useMap()
  const id = useId()
  const sourceId = `path-${id}`
  const lineId = `path-line-${id}`
  const gapId = `path-gap-${id}`
  const arrowId = `path-arrow-${id}`
  const hitId = `path-hit-${id}`
  const [open, setOpen] = useState<{
    segment: Segment
    lng: number
    lat: number
  } | null>(null)

  const segments = useMemo(() => {
    const out: Segment[] = []
    for (let i = 1; i < points.length; i++) {
      const from = points[i - 1]
      const to = points[i]
      if (from.beacon_id !== to.beacon_id) continue
      out.push({
        from,
        to,
        seconds:
          (new Date(to.observed_at).getTime() -
            new Date(from.observed_at).getTime()) /
          1000,
        meters: haversine(from, to),
      })
    }
    return out
  }, [points])

  const data = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: segments.map((s, index) => ({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [
            [s.from.longitude, s.from.latitude],
            [s.to.longitude, s.to.latitude],
          ],
        },
        properties: {
          index,
          color: colors.get(s.to.beacon_id) ?? "#2563eb",
          gap: s.seconds > GAP_S,
          arrow: s.meters >= ARROW_MIN_M,
          dim: selectedId != null && s.to.beacon_id !== selectedId,
          selected: s.to.beacon_id === selectedId,
        },
      })),
    }),
    [segments, colors, selectedId]
  )

  useEffect(() => {
    if (!map || !isLoaded) return
    map.addSource(sourceId, { type: "geojson", data })
    const width: MapLibreGL.ExpressionSpecification = [
      "case",
      ["get", "selected"],
      5,
      3,
    ]
    const opacity: MapLibreGL.ExpressionSpecification = [
      "case",
      ["get", "dim"],
      0.35,
      0.85,
    ]
    map.addLayer({
      id: lineId,
      type: "line",
      source: sourceId,
      filter: ["!", ["get", "gap"]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ["get", "color"],
        "line-width": width,
        "line-opacity": opacity,
      },
    })
    map.addLayer({
      id: gapId,
      type: "line",
      source: sourceId,
      filter: ["get", "gap"],
      paint: {
        "line-color": ["get", "color"],
        "line-width": width,
        "line-opacity": opacity,
        "line-dasharray": [1.5, 1.5],
      },
    })
    map.addLayer({
      id: arrowId,
      type: "symbol",
      source: sourceId,
      filter: ["get", "arrow"],
      layout: {
        "symbol-placement": "line",
        "symbol-spacing": 80,
        "icon-image": ["concat", ARROW, ["get", "color"]],
        "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.75, 16, 1],
        "icon-rotation-alignment": "map",
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
      paint: {
        "icon-opacity": ["case", ["get", "dim"], 0.35, 1],
      },
    })
    // A wide, invisible copy of the line, so a 3-pixel path is easy to click.
    map.addLayer({
      id: hitId,
      type: "line",
      source: sourceId,
      paint: { "line-color": "#000000", "line-width": 16, "line-opacity": 0 },
    })
    return () => {
      try {
        for (const layer of [hitId, arrowId, gapId, lineId])
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
    // One arrow image per beacon colour. A style swap drops images, so this runs after each.
    for (const color of new Set(colors.values()))
      if (!map.hasImage(ARROW + color))
        map.addImage(ARROW + color, arrowImage(color), { pixelRatio: 2 })
    ;(map.getSource(sourceId) as MapLibreGL.GeoJSONSource | undefined)?.setData(
      data
    )
  }, [map, isLoaded, sourceId, data, colors])

  // Latest values for the click handler, without re-binding it on every render.
  const latest = useRef({ segments, onPick })
  useEffect(() => {
    latest.current = { segments, onPick }
  })

  useEffect(() => {
    if (!map || !isLoaded) return
    const click = (e: MapLibreGL.MapMouseEvent) => {
      const hits = map.queryRenderedFeatures(e.point)
      // A dot on top wins: that's a report, handled by the sightings layer.
      if (hits.some((f) => f.layer.id.startsWith("sightings-layer"))) {
        setOpen(null)
        return
      }
      const hit = hits.find((f) => f.layer.id === hitId)
      const index = hit?.properties?.index
      const segment =
        typeof index === "number" ? latest.current.segments[index] : undefined
      if (!segment) {
        setOpen(null)
        return
      }
      setOpen({ segment, lng: e.lngLat.lng, lat: e.lngLat.lat })
      latest.current.onPick?.(segment)
    }
    const enter = () => (map.getCanvas().style.cursor = "pointer")
    const leave = () => (map.getCanvas().style.cursor = "")
    map.on("click", click)
    map.on("mouseenter", hitId, enter)
    map.on("mouseleave", hitId, leave)
    return () => {
      map.off("click", click)
      map.off("mouseenter", hitId, enter)
      map.off("mouseleave", hitId, leave)
    }
  }, [map, isLoaded, hitId])

  // A popup for a segment that's no longer drawn (new range, hidden beacon) has to go. Compared
  // by its end report, since each refresh brings new objects for the same reports.
  const shown =
    open &&
    segments.some(
      (s) =>
        s.to.beacon_id === open.segment.to.beacon_id &&
        s.to.observed_at === open.segment.to.observed_at &&
        s.from.observed_at === open.segment.from.observed_at
    )
      ? open
      : null

  return shown ? (
    <MapPopup
      key={`${shown.segment.to.observed_at}-${shown.lng}`}
      longitude={shown.lng}
      latitude={shown.lat}
      closeOnClick={false}
      onClose={() => setOpen(null)}
    >
      <SegmentDetails segment={shown.segment} />
    </MapPopup>
  ) : null
}

function SegmentDetails({ segment }: { segment: Segment }) {
  const { from, to, seconds, meters } = segment
  const gap = seconds > GAP_S
  const kmh = seconds > 0 ? (meters / seconds) * 3.6 : 0
  return (
    <div className="flex flex-col gap-0.5 text-xs">
      <span className="text-sm font-medium tabular-nums">
        {time(from.observed_at)} → {time(to.observed_at)}
      </span>
      {gap ? (
        <span className="text-muted-foreground">
          No reports for {duration(seconds)} · {distance(meters)} apart. The way
          it went isn&apos;t known.
        </span>
      ) : (
        <span className="text-muted-foreground tabular-nums">
          {duration(seconds)} · {distance(meters)}
          {meters >= ARROW_MIN_M && ` · ~${Math.round(kmh)} km/h`}
        </span>
      )}
    </div>
  )
}

function haversine(a: Point, b: Point): number {
  const rad = Math.PI / 180
  const dLat = (b.latitude - a.latitude) * rad
  const dLon = (b.longitude - a.longitude) * rad
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * rad) *
      Math.cos(b.latitude * rad) *
      Math.sin(dLon / 2) ** 2
  return 2 * 6_371_008.8 * Math.asin(Math.sqrt(h))
}

/** An arrowhead pointing east (along the line): the beacon's colour, outlined in white. */
function arrowImage(color: string): ImageData {
  const size = 36 // drawn at 2x, shown at 18 px
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")!
  ctx.beginPath()
  ctx.moveTo(9, 7)
  ctx.lineTo(29, 18)
  ctx.lineTo(9, 29)
  ctx.lineTo(14, 18)
  ctx.closePath()
  ctx.lineJoin = "round"
  ctx.lineWidth = 4
  ctx.strokeStyle = "#ffffff"
  ctx.stroke()
  ctx.fillStyle = color
  ctx.fill()
  return ctx.getImageData(0, 0, size, size)
}
