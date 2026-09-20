import { useState } from "react"
import { useSearchParams } from "react-router"

import { RangePicker } from "~/features/history/components/range-picker"
import { MapClick } from "~/features/map/components/map-click"
import { RadiusCircle } from "~/features/map/components/radius-circle"
import { TrackerLayers } from "~/features/map/components/tracker-layers"
import { getVisits } from "~/features/places/api/visits"
import { PlacesPanel } from "~/features/places/components/places-panel"
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
  const visits = place
    ? (
        await getVisits({
          lat: place.lat,
          lon: place.lon,
          radiusM,
          from: range.from,
          to: range.to,
        })
      ).visits
    : null
  return { range, place, radiusM, visits }
}

export default function Places({ loaderData }: Route.ComponentProps) {
  const { range, place, radiusM, visits } = loaderData
  const { beacons, loadedAt } = useLayoutData()
  const [params, setParams] = useSearchParams()
  const hidden = getHidden(params)
  // Opened with a place (a link, or back from elsewhere): frame it. Later clicks keep the view.
  const [arrival] = useState(() =>
    place ? circleCorners(place.lat, place.lon, radiusM) : undefined
  )

  function update(changes: Record<string, string>) {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) next.set(k, v)
    setParams(next, { replace: true })
  }

  return (
    <>
      <TrackerLayers
        beacons={beacons.filter((b) => !hidden.has(b.id))}
        fitKey="places"
        frameAround={arrival}
        framePadding={panelPadding}
        now={loadedAt}
      />
      <MapClick
        onClick={(lat, lon) =>
          update({ lat: lat.toFixed(6), lon: lon.toFixed(6) })
        }
      />
      {place && (
        <RadiusCircle lat={place.lat} lon={place.lon} radiusM={radiusM} />
      )}
      <div className="pointer-events-none absolute top-3 right-3 bottom-14 left-3 z-10 flex items-start [&>*]:pointer-events-auto">
        <PlacesPanel
          place={place}
          radiusM={radiusM}
          visits={visits}
          beacons={beacons}
          onRadius={(r) => update({ r: String(r) })}
        >
          <RangePicker
            range={range}
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
