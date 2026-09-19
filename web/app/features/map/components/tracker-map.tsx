import type { ReactNode } from "react"
import { useMemo } from "react"

import {
  Map,
  MapControls,
  MapMarker,
  MapRoute,
  MarkerContent,
} from "~/components/ui/map"
import type { Schemas } from "~/lib/api/client"
import { useMapStyle } from "~/lib/map-styles"

import { BeaconMarker } from "./beacon-marker"
import { FitToData } from "./fit-to-data"
import { MapStylePicker } from "./map-style-picker"
import { SightingsLayer } from "./sightings-layer"

type Beacon = Schemas["BeaconOut"]
type Point = Schemas["LocationPoint"]

type Props = {
  beacons: Beacon[]
  /** History to draw as paths + dots. Omit to show only latest positions. */
  points?: Point[]
  selectedId?: number | null
  /** Change to re-frame the map around the data. */
  fitKey: string
  /** A single sighting to fly to and ring (e.g. picked from a timeline). */
  focus?: { latitude: number; longitude: number; key: string } | null
  now: number
  className?: string
  /** Extra controls shown top-right, next to the style picker (e.g. a refresh button). */
  controls?: ReactNode
  children?: ReactNode
}

/** The map of beacons: latest-position markers, plus paths when history is given. */
export function TrackerMap({
  beacons,
  points,
  selectedId,
  fitKey,
  focus,
  now,
  className,
  controls,
  children,
}: Props) {
  const mapStyle = useMapStyle()
  const colors = useMemo(
    () => new globalThis.Map(beacons.map((b) => [b.id, b.color ?? "#2563eb"])),
    [beacons]
  )
  const byBeacon = useMemo(() => {
    const groups = new globalThis.Map<number, Point[]>()
    for (const p of points ?? []) {
      const list = groups.get(p.beacon_id)
      if (list) list.push(p)
      else groups.set(p.beacon_id, [p])
    }
    return groups
  }, [points])

  const visibleIds = useMemo(() => new Set(beacons.map((b) => b.id)), [beacons])
  const visiblePoints = useMemo(
    () => (points ?? []).filter((p) => visibleIds.has(p.beacon_id)),
    [points, visibleIds]
  )

  const frame = useMemo<[number, number][]>(() => {
    if (points) return visiblePoints.map((p) => [p.longitude, p.latitude])
    return beacons.flatMap((b) =>
      b.latest ? [[b.latest.longitude, b.latest.latitude]] : []
    ) as [number, number][]
  }, [points, visiblePoints, beacons])

  return (
    <Map
      className={className}
      center={[0, 20]}
      zoom={1.5}
      styles={mapStyle.styles}
    >
      <MapControls position="bottom-right" showZoom showCompass showLocate />
      <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
        {controls}
        <MapStylePicker value={mapStyle.id} onChange={mapStyle.setId} />
      </div>
      {points && (
        <>
          {beacons.map((b) => {
            const path = byBeacon.get(b.id)
            if (!path || path.length < 2) return null
            return (
              <MapRoute
                key={`path-${b.id}`}
                id={`path-${b.id}`}
                coordinates={path.map((p) => [p.longitude, p.latitude])}
                color={b.color ?? "#2563eb"}
                width={b.id === selectedId ? 5 : 3}
                opacity={selectedId && b.id !== selectedId ? 0.35 : 0.85}
                interactive={false}
              />
            )
          })}
          <SightingsLayer points={visiblePoints} colors={colors} />
        </>
      )}
      {beacons.map((b) => {
        // In history mode, pin each beacon at its last sighting inside the range.
        const path = byBeacon.get(b.id)
        const last = points ? path?.[path.length - 1] : undefined
        if (points && !last) return null
        return (
          <BeaconMarker
            key={b.id}
            beacon={b}
            position={last}
            selected={b.id === selectedId}
            now={now}
          />
        )
      })}
      <FitToData coordinates={frame} fitKey={fitKey} />
      {focus && (
        <>
          <MapMarker longitude={focus.longitude} latitude={focus.latitude}>
            <MarkerContent>
              <div className="size-5 rounded-full border-4 border-foreground bg-background shadow-md" />
            </MarkerContent>
          </MapMarker>
          <FitToData
            coordinates={[[focus.longitude, focus.latitude]]}
            fitKey={focus.key}
          />
        </>
      )}
      {children}
    </Map>
  )
}
