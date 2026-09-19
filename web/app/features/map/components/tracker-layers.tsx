import { useEffect, useMemo } from "react"

import { MapMarker, MapRoute, MarkerContent, useMap } from "~/components/ui/map"
import type { Schemas } from "~/lib/api/client"

import { BeaconMarker } from "./beacon-marker"
import { FitToData, moveTo } from "./fit-to-data"
import { SightingsLayer } from "./sightings-layer"

type Beacon = Schemas["BeaconOut"]
type Point = Schemas["LocationPoint"]

export type MapFocus = {
  latitude: number
  longitude: number
  key: string
  /** Move the map to it. False when it was picked on the map, where it's already in view. */
  move: boolean
}

type Props = {
  beacons: Beacon[]
  /**
   * History to draw as paths + dots. Omit to show only latest positions. Noisy points are drawn
   * as faint dots only: paths, pins and framing use the good ones.
   */
  points?: Point[]
  selectedId?: number | null
  /** Change to re-frame the map around the data. */
  fitKey: string
  /** Frame these instead of the data. */
  frameAround?: [number, number][]
  /** Room to leave around the frame, e.g. for a panel floating over the map. */
  framePadding?:
    number | { top: number; bottom: number; left: number; right: number }
  /** A sighting (or stay) to ring, e.g. picked from a timeline. */
  focus?: MapFocus | null
  /** Called when a history dot is clicked. */
  onPick?: (point: Point) => void
  now: number
}

/** What a map page draws on the shared map: latest markers, plus paths when history is given. */
export function TrackerLayers({
  beacons,
  points,
  selectedId,
  fitKey,
  frameAround,
  framePadding,
  focus,
  onPick,
  now,
}: Props) {
  const colors = useMemo(
    () => new globalThis.Map(beacons.map((b) => [b.id, b.color ?? "#2563eb"])),
    [beacons]
  )
  const byBeacon = useMemo(() => {
    const groups = new globalThis.Map<number, Point[]>()
    for (const p of points ?? []) {
      if (p.noise) continue
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
    if (points)
      return visiblePoints
        .filter((p) => !p.noise)
        .map((p) => [p.longitude, p.latitude])
    return beacons.flatMap((b) =>
      b.latest ? [[b.latest.longitude, b.latest.latitude]] : []
    ) as [number, number][]
  }, [points, visiblePoints, beacons])

  return (
    <>
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
          <SightingsLayer
            points={visiblePoints}
            colors={colors}
            onPick={onPick}
          />
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
      <FitToData
        coordinates={frameAround ?? frame}
        fitKey={fitKey}
        padding={framePadding}
      />
      {focus && (
        <>
          <MapMarker longitude={focus.longitude} latitude={focus.latitude}>
            <MarkerContent>
              <div className="pointer-events-none size-5 rounded-full border-4 border-foreground bg-background shadow-md" />
            </MarkerContent>
          </MapMarker>
          {focus.move && <FlyToFocus focus={focus} />}
        </>
      )}
    </>
  )
}

/** Bring a picked sighting into view, closer if the map is zoomed far out. */
function FlyToFocus({ focus }: { focus: MapFocus }) {
  const { map, isLoaded } = useMap()
  useEffect(() => {
    if (!map || !isLoaded) return
    moveTo(map, {
      center: [focus.longitude, focus.latitude],
      zoom: Math.max(map.getZoom(), 15),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, isLoaded, focus.key])
  return null
}
