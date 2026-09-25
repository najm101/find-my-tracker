import { useEffect, useMemo } from "react"

import { MapMarker, MarkerContent, useMap } from "~/components/ui/map"
import type { Schemas } from "~/lib/api/client"
import {
  type PredictedTrip,
  coveredKeys,
  offRouteKeys,
} from "~/lib/predicted-routes"
import type { RouteMode } from "~/lib/search-params"

import { BeaconMarker } from "./beacon-marker"
import { FitToData, moveTo } from "./fit-to-data"
import { PathLayer, type Segment } from "./path-layer"
import { PredictedRouteLayer } from "./predicted-route-layer"
import { SightingsLayer } from "./sightings-layer"

type Beacon = Schemas["BeaconOut"]
type Point = Schemas["LocationPoint"]

export type MapFocus = {
  latitude: number
  longitude: number
  key: string
  /** Move the map to it. False when it was picked on the map, where it's already in view. */
  move: boolean
  /** Other rows to highlight with it, e.g. the start of a picked segment. */
  also?: string[]
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
  /**
   * History is the backdrop to a playback: paths and dots faded, and no pins, since the
   * playback draws its own moving ones.
   */
  backdrop?: boolean
  /** Draw the path as reported, as its predicted route (`predicted`), or both. */
  pathMode?: RouteMode
  /** History's predicted routes, for `pathMode` "predicted" and "both". */
  predicted?: PredictedTrip[]
  /**
   * Predicted routes are still being found. Meanwhile "predicted" shows the reported path faintly
   * wherever there is no predicted route yet, and the map works as usual.
   */
  predicting?: boolean
  /** `tripKey`s of predicted routes to draw in as they arrive. */
  drawIn?: ReadonlySet<string>
  /** Called when a history dot is clicked. */
  onPick?: (point: Point) => void
  /** Called when a path segment is clicked (its popup shows either way). */
  onPickSegment?: (segment: Segment) => void
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
  backdrop = false,
  pathMode = "reported",
  predicted,
  predicting = false,
  drawIn,
  onPick,
  onPickSegment,
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

  const goodPoints = useMemo(
    () => visiblePoints.filter((p) => !p.noise),
    [visiblePoints]
  )

  // The predicted routes on the map, if the path mode shows them.
  const routes =
    pathMode !== "reported" && predicted
      ? predicted.filter((t) => visibleIds.has(t.beacon_id))
      : undefined

  const frame = useMemo<[number, number][]>(() => {
    if (points) return goodPoints.map((p) => [p.longitude, p.latitude])
    return beacons.flatMap((b) =>
      b.latest ? [[b.latest.longitude, b.latest.latitude]] : []
    ) as [number, number][]
  }, [points, goodPoints, beacons])

  return (
    <>
      {points && (
        <>
          {(pathMode !== "predicted" || predicting) && (
            <PathLayer
              points={goodPoints}
              colors={colors}
              selectedId={selectedId}
              faded={
                backdrop ||
                pathMode === "predicted" ||
                (pathMode === "both" && !!routes)
              }
              covered={
                pathMode === "predicted" && routes
                  ? coveredKeys(routes)
                  : undefined
              }
              onPick={onPickSegment}
            />
          )}
          {routes && (
            <PredictedRouteLayer
              trips={routes}
              colors={colors}
              selectedId={selectedId}
              faded={backdrop}
              drawIn={drawIn}
            />
          )}
          <SightingsLayer
            points={visiblePoints}
            colors={colors}
            faded={backdrop}
            offRoute={routes ? offRouteKeys(routes) : undefined}
            onPick={onPick}
          />
        </>
      )}
      {beacons.map((b) => {
        // In history mode, pin each beacon at its last sighting inside the range.
        const path = byBeacon.get(b.id)
        const last = points ? path?.[path.length - 1] : undefined
        if (backdrop || (points && !last)) return null
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
