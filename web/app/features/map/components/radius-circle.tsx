import { useMemo } from "react"

import { MapGeoJSON } from "~/components/ui/map"

const EARTH_RADIUS_M = 6_371_008.8

/** A geodesic circle as a 64-sided polygon. */
function circlePolygon(
  lat: number,
  lon: number,
  radiusM: number
): GeoJSON.Feature {
  const coords: [number, number][] = []
  const d = radiusM / EARTH_RADIUS_M
  const φ1 = (lat * Math.PI) / 180
  const λ1 = (lon * Math.PI) / 180
  for (let i = 0; i <= 64; i++) {
    const θ = (i / 64) * 2 * Math.PI
    const φ2 = Math.asin(
      Math.sin(φ1) * Math.cos(d) + Math.cos(φ1) * Math.sin(d) * Math.cos(θ)
    )
    const λ2 =
      λ1 +
      Math.atan2(
        Math.sin(θ) * Math.sin(d) * Math.cos(φ1),
        Math.cos(d) - Math.sin(φ1) * Math.sin(φ2)
      )
    coords.push([(λ2 * 180) / Math.PI, (φ2 * 180) / Math.PI])
  }
  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [coords] },
    properties: {},
  }
}

export function RadiusCircle({
  lat,
  lon,
  radiusM,
}: {
  lat: number
  lon: number
  radiusM: number
}) {
  const data = useMemo(
    () => circlePolygon(lat, lon, radiusM),
    [lat, lon, radiusM]
  )
  return (
    <MapGeoJSON
      id="place-radius"
      data={data}
      fillPaint={{ "fill-color": "#2563eb", "fill-opacity": 0.12 }}
      linePaint={{ "line-color": "#2563eb", "line-width": 2 }}
    />
  )
}
