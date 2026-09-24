import * as MapLibreGL from "maplibre-gl"
import { useEffect, useId, useRef } from "react"

import { MapMarker, MarkerContent, useMap } from "~/components/ui/map"
import type { Schemas } from "~/lib/api/client"
import {
  type LngLat,
  type Track,
  leg,
  positionAt,
  reportIndexAt,
  travelled,
} from "~/lib/playback"

import { BeaconBubble } from "./beacon-marker"

type Beacon = Schemas["BeaconOut"]

type Props = {
  tracks: Track[]
  beacons: Beacon[]
  /** The moment shown, epoch ms. */
  at: number
  playing: boolean
  /** Keep the map centred on the marker(s). */
  follow: boolean
  /** Map pixels covered at the bottom (by the player): the markers are kept above them. */
  bottomInset?: number
}

const EMPTY: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
}

/**
 * History being played back: the way travelled so far drawn solid over the faded full path, and
 * each item's marker where it was at `at`. While playing, the map pans before a marker leaves it.
 *
 * The way travelled is two sources: everything up to the last report passed, redrawn only when a
 * report is passed, and the short leg from there to the marker, redrawn every frame.
 */
export function PlaybackLayer({
  tracks,
  beacons,
  at,
  playing,
  follow,
  bottomInset = 0,
}: Props) {
  const { map, isLoaded } = useMap()
  const id = useId()
  const doneId = `playback-done-${id}`
  const legId = `playback-leg-${id}`
  // What the travelled source was last drawn from, so it's redrawn only when that changes.
  const drawn = useRef<{
    tracks: Track[]
    beacons: Beacon[]
    key: string
  } | null>(null)

  useEffect(() => {
    if (!map || !isLoaded) return
    const layers: string[] = []
    for (const source of [doneId, legId]) {
      map.addSource(source, { type: "geojson", data: EMPTY })
      map.addLayer({
        id: `${source}-line`,
        type: "line",
        source,
        filter: ["!", ["get", "gap"]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["get", "color"],
          "line-width": 5,
          "line-opacity": 0.95,
        },
      })
      map.addLayer({
        id: `${source}-gap`,
        type: "line",
        source,
        filter: ["get", "gap"],
        paint: {
          "line-color": ["get", "color"],
          "line-width": 4,
          "line-opacity": 0.95,
          "line-dasharray": [1.5, 1.5],
        },
      })
      layers.push(`${source}-line`, `${source}-gap`)
    }
    drawn.current = null
    return () => {
      try {
        for (const layer of layers)
          if (map.getLayer(layer)) map.removeLayer(layer)
        for (const source of [doneId, legId])
          if (map.getSource(source)) map.removeSource(source)
      } catch {
        // style may be mid-reload
      }
    }
  }, [map, isLoaded, doneId, legId])

  useEffect(() => {
    if (!map || !isLoaded) return
    const colors = new Map(beacons.map((b) => [b.id, b.color ?? "#2563eb"]))
    const indices = tracks.map((t) => reportIndexAt(t, at))
    const key = indices.join()
    const last = drawn.current
    if (
      last?.tracks !== tracks ||
      last.beacons !== beacons ||
      last.key !== key
    ) {
      drawn.current = { tracks, beacons, key }
      setData(
        map,
        doneId,
        tracks.flatMap((t, i) => {
          const { moving, gaps } = travelled(t, indices[i])
          const color = colors.get(t.beaconId)
          return [lines(moving, false, color), lines(gaps, true, color)]
        })
      )
    }
    setData(
      map,
      legId,
      tracks.flatMap((t) => {
        const current = leg(t, at)
        return current
          ? [lines([current.line], current.gap, colors.get(t.beaconId))]
          : []
      })
    )
  }, [map, isLoaded, doneId, legId, tracks, beacons, at])

  useEffect(() => {
    if (!map || !isLoaded) return
    const heads = tracks
      .map((t) => positionAt(t, at))
      .filter((h): h is LngLat => h !== null)
    if (heads.length === 0) return
    if (follow) {
      map.easeTo({
        center: centre(heads),
        offset: [0, -bottomInset / 2],
        duration: 0,
      })
      return
    }
    // Not while the map is moving: that's the viewer dragging it, or the last pan.
    if (!playing || map.isMoving()) return
    const { width, height } = map.getContainer().getBoundingClientRect()
    const margin = Math.min(width, height) * 0.12
    const leaving = heads.some((h) => {
      const p = map.project(h)
      return (
        p.x < margin ||
        p.y < margin ||
        p.x > width - margin ||
        p.y > height - bottomInset - margin
      )
    })
    if (!leaving) return
    const bounds = heads.reduce(
      (b, h) => b.extend(h),
      new MapLibreGL.LngLatBounds(heads[0], heads[0])
    )
    const camera = map.cameraForBounds(bounds, {
      padding: { top: 80, left: 80, right: 80, bottom: bottomInset + 80 },
      maxZoom: map.getZoom(),
    })
    if (camera) map.easeTo({ ...camera, duration: 600, essential: true })
  }, [map, isLoaded, tracks, at, playing, follow, bottomInset])

  return tracks.map((track) => {
    const head = positionAt(track, at)
    const beacon = beacons.find((b) => b.id === track.beaconId)
    if (!head || !beacon) return null
    return (
      <MapMarker key={track.beaconId} longitude={head[0]} latitude={head[1]}>
        <MarkerContent>
          <BeaconBubble beacon={beacon} selected />
        </MarkerContent>
      </MapMarker>
    )
  })
}

function lines(
  coordinates: LngLat[][],
  gap: boolean,
  color = "#2563eb"
): GeoJSON.Feature {
  return {
    type: "Feature",
    geometry: { type: "MultiLineString", coordinates },
    properties: { gap, color },
  }
}

function setData(
  map: MapLibreGL.Map,
  source: string,
  features: GeoJSON.Feature[]
) {
  ;(map.getSource(source) as MapLibreGL.GeoJSONSource | undefined)?.setData({
    type: "FeatureCollection",
    features,
  })
}

function centre(points: LngLat[]): LngLat {
  const sum = points.reduce((s, p) => [s[0] + p[0], s[1] + p[1]], [0, 0])
  return [sum[0] / points.length, sum[1] / points.length]
}
