import * as MapLibreGL from "maplibre-gl"
import { useEffect } from "react"

import { useMap } from "~/components/ui/map"

const PADDING = 72
const DURATION = 700

/** Maps that have been framed once. Pages come and go; the map (and this) stays. */
const framedMaps = new WeakSet<MapLibreGL.Map>()

/**
 * Frame the given coordinates whenever `fitKey` changes. The first frame after the map loads is
 * instant; later ones glide from wherever the map is.
 */
export function FitToData({
  coordinates,
  fitKey,
  maxZoom = 16,
  padding = PADDING,
}: {
  coordinates: [number, number][]
  fitKey: string
  maxZoom?: number
  /** Extra room on a side covered by an overlay (e.g. a floating panel). */
  padding?: number | MapLibreGL.PaddingOptions
}) {
  const { map, isLoaded } = useMap()

  useEffect(() => {
    if (!map || !isLoaded || coordinates.length === 0) return
    // A panel may have just opened or closed beside the map: measure before framing.
    map.resize()
    const bounds = coordinates.reduce(
      (b, c) => b.extend(c),
      new MapLibreGL.LngLatBounds(coordinates[0], coordinates[0])
    )
    const camera = map.cameraForBounds(bounds, { padding, maxZoom })
    if (camera) moveTo(map, camera, { instant: !framedMaps.has(map) })
    framedMaps.add(map)
    // Only refit when the caller says the data set changed, not on every poll refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, isLoaded, fitKey])

  return null
}

/**
 * Glide when the destination is nearby; fly (zoom out, across, back in) only when it is far,
 * where a straight glide would smear the map past at street level.
 */
export function moveTo(
  map: MapLibreGL.Map,
  camera: MapLibreGL.CameraOptions,
  { instant = false }: { instant?: boolean } = {}
) {
  if (instant) {
    map.jumpTo(camera)
    return
  }
  const target = MapLibreGL.LngLat.convert(camera.center ?? map.getCenter())
  const from = map.project(map.getCenter())
  const to = map.project(target)
  const { width, height } = map.getContainer().getBoundingClientRect()
  const screens =
    Math.hypot(to.x - from.x, to.y - from.y) / Math.max(width, height, 1)
  if (screens > 3) {
    map.flyTo({ ...camera, duration: DURATION * 1.6, essential: true })
  } else {
    map.easeTo({ ...camera, duration: DURATION, essential: true })
  }
}
