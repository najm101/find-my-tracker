import { useSearchParams } from "react-router"

import { RangePicker } from "~/features/history/components/range-picker"
import { MapClick } from "~/features/map/components/map-click"
import { RadiusCircle } from "~/features/map/components/radius-circle"
import { TrackerMap } from "~/features/map/components/tracker-map"
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

  function update(changes: Record<string, string>) {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) next.set(k, v)
    setParams(next, { replace: true })
  }

  return (
    <div className="relative h-svh w-full">
      <TrackerMap
        className="absolute inset-0"
        beacons={beacons.filter((b) => !hidden.has(b.id))}
        fitKey="places"
        now={loadedAt}
      >
        <MapClick
          onClick={(lat, lon) =>
            update({ lat: lat.toFixed(6), lon: lon.toFixed(6) })
          }
        />
        {place && (
          <RadiusCircle lat={place.lat} lon={place.lon} radiusM={radiusM} />
        )}
      </TrackerMap>
      <div className="pointer-events-none absolute top-3 right-3 bottom-3 left-14 z-10 flex items-start md:left-3 [&>*]:pointer-events-auto">
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
    </div>
  )
}
