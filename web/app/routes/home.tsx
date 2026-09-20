import { useSearchParams } from "react-router"

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { getLocations } from "~/features/history/api/locations"
import { HistoryToolbar } from "~/features/history/components/history-toolbar"
import { TrackerLayers } from "~/features/map/components/tracker-layers"
import {
  getHidden,
  getMode,
  getShowNoise,
  withMode,
  withShowNoise,
} from "~/lib/search-params"
import { rangeFromParams, withRange } from "~/lib/time-range"

import type { Route } from "./+types/home"
import { useLayoutData } from "./authed-layout"

export function meta() {
  return [{ title: "Map · Find My Tracker" }]
}

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const params = new URL(request.url).searchParams
  const mode = getMode(params)
  const range = rangeFromParams(params)
  // History for every beacon at once; hiding is applied client-side so toggling is instant.
  const history =
    mode === "history"
      ? await getLocations({ from: range.from, to: range.to })
      : null
  return { mode, range, history }
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { mode, range, history } = loaderData
  const { beacons, loadedAt } = useLayoutData()
  const [params, setParams] = useSearchParams()
  const hidden = getHidden(params)
  const visible = beacons.filter((b) => !hidden.has(b.id))
  const located = beacons.some((b) => b.latest)
  const showNoise = getShowNoise(params)
  const shown = history?.points.filter((p) => !hidden.has(p.beacon_id))
  const good = shown?.filter((p) => !p.noise)

  return (
    <>
      <TrackerLayers
        beacons={visible}
        points={showNoise ? history?.points : good}
        fitKey={`home|${mode}|${range.preset}|${range.preset === "custom" ? range.from.toISOString() : ""}`}
        now={loadedAt}
      />
      <div className="pointer-events-none absolute top-3 left-3 z-10">
        <HistoryToolbar
          mode={mode}
          range={range}
          filters={{
            from: range.from,
            to: range.to,
            beaconIds: hidden.size ? visible.map((b) => b.id) : undefined,
          }}
          pointCount={good?.length}
          noisyCount={(shown?.length ?? 0) - (good?.length ?? 0)}
          showNoise={showNoise}
          truncated={history?.truncated}
          onMode={(m) => setParams(withMode(params, m))}
          onPreset={(preset) => setParams(withRange(params, { preset }))}
          onCustom={(from, to) => setParams(withRange(params, { from, to }))}
          onShowNoise={(on) => setParams(withShowNoise(params, on))}
        />
      </div>
      {!located && (
        <Card className="absolute bottom-6 left-1/2 z-10 w-[min(24rem,calc(100%-2rem))] -translate-x-1/2">
          <CardHeader>
            <CardTitle>Waiting for the first sightings</CardTitle>
            <CardDescription>
              Nothing has been located yet. The first check can take a few
              minutes; positions appear here as soon as Apple reports them.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </>
  )
}
