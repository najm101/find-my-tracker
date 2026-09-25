import { useState } from "react"
import { useSearchParams } from "react-router"

import { getLocations } from "~/features/history/api/locations"
import { RangePicker } from "~/features/history/components/range-picker"
import { MapClick } from "~/features/map/components/map-click"
import { RadiusCircle } from "~/features/map/components/radius-circle"
import { TrackerLayers } from "~/features/map/components/tracker-layers"
import { getVisits } from "~/features/places/api/visits"
import { PlacesPanel } from "~/features/places/components/places-panel"
import {
  highlightKeys,
  inVisit,
  sightingsInside,
  visitKey,
} from "~/features/places/inside"
import type { Schemas } from "~/lib/api/client"
import { getHidden } from "~/lib/search-params"
import { rangeFromParams, withRange } from "~/lib/time-range"

import type { Route } from "./+types/places"
import { useLayoutData } from "./authed-layout"

const DEFAULT_RADIUS = 200

export function meta() {
  return [{ title: "Near a place · Find My Tracker" }]
}

function readPlace(params: URLSearchParams) {
  const lat = Number(params.get("lat"))
  const lon = Number(params.get("lon"))
  const place =
    params.has("lat") &&
    params.has("lon") &&
    Number.isFinite(lat) &&
    Number.isFinite(lon)
      ? { lat, lon }
      : null
  const radiusM = Number(params.get("r")) || DEFAULT_RADIUS
  return { place, radiusM }
}

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const params = new URL(request.url).searchParams
  const range = rangeFromParams(params)
  const { place, radiusM } = readPlace(params)
  // The range's sightings show on the map for context; the ones inside the circle stand out.
  const [history, visits] = await Promise.all([
    getLocations({ from: range.from, to: range.to }),
    place
      ? getVisits({
          lat: place.lat,
          lon: place.lon,
          radiusM,
          from: range.from,
          to: range.to,
        }).then((r) => r.visits)
      : null,
  ])
  return { range, place, radiusM, visits, history }
}

export default function Places({ loaderData }: Route.ComponentProps) {
  const { range, place, radiusM, visits, history } = loaderData
  const { beacons, loadedAt } = useLayoutData()
  const [params, setParams] = useSearchParams()
  const hidden = getHidden(params)
  // Opened with a place (a link, or back from elsewhere): frame it. Later clicks keep the view.
  const [arrival] = useState(() =>
    place ? circleCorners(place.lat, place.lon, radiusM) : undefined
  )
  // While the radius slider moves, the circle and the highlights follow it at once; the visits
  // load again once it's let go.
  const [dragged, setDragged] = useState<number | null>(null)
  if (dragged !== null && dragged === radiusM) setDragged(null)
  const radius = dragged ?? radiusM

  const shown = beacons.filter((b) => !hidden.has(b.id))
  const points = history.points.filter((p) => !hidden.has(p.beacon_id))
  const shownVisits = visits?.filter((v) => !hidden.has(v.beacon_id)) ?? null
  const inside = place ? sightingsInside(points, place, radius) : []
  const chosen =
    shownVisits?.find((v) => visitKey(v) === params.get("visit")) ?? null
  const chosenPoints = chosen ? inside.filter((p) => inVisit(p, chosen)) : []
  // The map frames each visit as it's picked; "Show all" leaves the view where it is.
  const [framed, setFramed] = useState<string | null>(null)
  if (chosen && visitKey(chosen) !== framed) setFramed(visitKey(chosen))

  function update(changes: Record<string, string>) {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) next.set(k, v)
    next.delete("visit") // another place or radius: other visits
    setParams(next, { replace: true })
  }

  function choose(visit: Schemas["Visit"] | null) {
    const next = new URLSearchParams(params)
    if (visit) next.set("visit", visitKey(visit))
    else next.delete("visit")
    setParams(next, { replace: true })
  }

  return (
    <>
      <TrackerLayers
        beacons={shown}
        points={points}
        // With a place picked, everything but its sightings steps back.
        backdrop={place !== null}
        highlight={place ? highlightKeys(inside, chosen) : undefined}
        onPick={
          place
            ? (p) => {
                const visit = shownVisits?.find(
                  (v) => inside.includes(p) && inVisit(p, v)
                )
                if (!visit) return false // outside: the click picks a new place
                const same =
                  chosen !== null && visitKey(chosen) === visitKey(visit)
                choose(same ? null : visit)
              }
            : undefined
        }
        fitKey={framed ? `places|${framed}` : "places"}
        frameAround={
          chosenPoints.length
            ? chosenPoints.map((p): [number, number] => [
                p.longitude,
                p.latitude,
              ])
            : arrival
        }
        framePadding={panelPadding}
        now={loadedAt}
      />
      <MapClick
        onClick={(lat, lon) =>
          update({ lat: lat.toFixed(6), lon: lon.toFixed(6) })
        }
      />
      {place && (
        <RadiusCircle lat={place.lat} lon={place.lon} radiusM={radius} />
      )}
      <div className="pointer-events-none absolute top-3 right-3 bottom-14 left-3 z-10 flex items-start [&>*]:pointer-events-auto">
        <PlacesPanel
          place={place}
          radiusM={radius}
          visits={shownVisits}
          beacons={beacons}
          insideCount={inside.length}
          selected={chosen ? visitKey(chosen) : null}
          onSelect={choose}
          onRadius={setDragged}
          onRadiusCommit={(r) => update({ r: String(r) })}
        >
          <RangePicker
            range={range}
            now={loadedAt}
            onPreset={(preset) =>
              setParams(withRange(params, { preset }), { replace: true })
            }
            onCustom={(from, to) =>
              setParams(withRange(params, { from, to }), { replace: true })
            }
          />
        </PlacesPanel>
      </div>
    </>
  )
}

/** The results panel floats over the map's left side on wider screens. */
const panelPadding =
  typeof window !== "undefined" && window.innerWidth >= 768
    ? { top: 72, bottom: 72, right: 72, left: 360 }
    : 72

/** Two corners of a box around a circle, [lon, lat], enough to frame it. */
function circleCorners(
  lat: number,
  lon: number,
  radiusM: number
): [number, number][] {
  const dLat = radiusM / 111_320
  const dLon = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180))
  return [
    [lon - dLon, lat - dLat],
    [lon + dLon, lat + dLat],
  ]
}
