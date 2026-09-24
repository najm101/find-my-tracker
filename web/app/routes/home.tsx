import { useSearchParams } from "react-router"

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { getLocations } from "~/features/history/api/locations"
import { HistoryToolbar } from "~/features/history/components/history-toolbar"
import {
  PLAYBACK_BAR_INSET,
  PlaybackBar,
} from "~/features/history/components/playback-bar"
import { usePlayback } from "~/features/history/hooks/use-playback"
import { PlaybackLayer } from "~/features/map/components/playback-layer"
import { TrackerLayers } from "~/features/map/components/tracker-layers"
import { getRoutes } from "~/features/routing/api/routing"
import { RouteModeToggle } from "~/features/routing/components/route-mode-toggle"
import { RoutesNotice } from "~/features/routing/components/routes-notice"
import { buildClock, buildTracks } from "~/lib/playback"
import {
  getHidden,
  getMode,
  getRouteMode,
  getShowNoise,
  withMode,
  withRouteMode,
  withShowNoise,
} from "~/lib/search-params"
import { rangeFromParams, rangeKey, withRange } from "~/lib/time-range"

import type { Route } from "./+types/home"
import { useLayoutData } from "./authed-layout"

export function meta() {
  return [{ title: "Map · Find My Tracker" }]
}

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const params = new URL(request.url).searchParams
  const mode = getMode(params)
  const range = rangeFromParams(params)
  const roads = mode === "history" && getRouteMode(params) !== "reported"
  // History for every beacon at once; hiding is applied client-side so toggling is instant.
  const [history, routes] =
    mode === "history"
      ? await Promise.all([
          getLocations({ from: range.from, to: range.to }),
          roads ? getRoutes({ from: range.from, to: range.to }) : null,
        ])
      : [null, null]
  return { mode, range, history, routes }
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { mode, range, history, routes } = loaderData
  const { beacons, loadedAt } = useLayoutData()
  const [params, setParams] = useSearchParams()
  const hidden = getHidden(params)
  const visible = beacons.filter((b) => !hidden.has(b.id))
  const located = beacons.some((b) => b.latest)
  const showNoise = getShowNoise(params)
  const shown = history?.points.filter((p) => !hidden.has(p.beacon_id))
  const good = shown?.filter((p) => !p.noise)
  const routeMode = getRouteMode(params)
  const roads =
    routeMode !== "reported" && routes?.state === "ok"
      ? routes.trips
      : undefined
  // Playback follows the roads whenever they are on the map.
  const tracks = buildTracks(good ?? [], history?.stays ?? [], roads)
  const clock = buildClock(tracks)
  const player = usePlayback(clock, `${mode}|${rangeKey(range)}`)
  const playing = mode === "history" && player.open

  return (
    <>
      <TrackerLayers
        beacons={visible}
        points={showNoise ? history?.points : good}
        fitKey={`home|${mode}|${rangeKey(range)}`}
        backdrop={playing}
        pathMode={routeMode}
        roads={roads}
        now={loadedAt}
      />
      {playing && (
        <>
          <PlaybackLayer
            tracks={tracks}
            beacons={visible}
            at={player.at}
            playing={player.playing}
            follow={player.follow}
            bottomInset={PLAYBACK_BAR_INSET}
          />
          <PlaybackBar clock={clock} player={player} />
        </>
      )}
      <div className="pointer-events-none absolute top-3 left-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-col items-start gap-2">
        <HistoryToolbar
          mode={mode}
          range={range}
          now={loadedAt}
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
          onPlay={player.play}
          canPlay={player.playable}
          extra={
            <RouteModeToggle
              mode={routeMode}
              onMode={(m) => setParams(withRouteMode(params, m))}
            />
          }
        />
        {mode === "history" && routeMode !== "reported" && routes && (
          <RoutesNotice routes={routes} className="max-w-sm bg-background/95" />
        )}
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
