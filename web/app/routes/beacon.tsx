import { ArrowLeftIcon, PlayIcon } from "lucide-react"
import { useState } from "react"
import { Link, useSearchParams } from "react-router"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { getLocations } from "~/features/history/api/locations"
import { DayTimeline } from "~/features/history/components/day-timeline"
import { ExportMenu } from "~/features/history/components/export-menu"
import { NoiseToggle } from "~/features/history/components/noise-toggle"
import {
  PLAYBACK_BAR_INSET,
  PlaybackBar,
} from "~/features/history/components/playback-bar"
import { RangePicker } from "~/features/history/components/range-picker"
import { usePlayback } from "~/features/history/hooks/use-playback"
import { indexStays, rowKeyFor } from "~/features/history/timeline"
import { PlaybackLayer } from "~/features/map/components/playback-layer"
import {
  type MapFocus,
  TrackerLayers,
} from "~/features/map/components/tracker-layers"
import { getRoutes } from "~/features/routing/api/routing"
import { RouteModeToggle } from "~/features/routing/components/route-mode-toggle"
import { RoutesNotice } from "~/features/routing/components/routes-notice"
import type { Schemas } from "~/lib/api/client"
import { BEACON_KINDS } from "~/lib/beacon-kind"
import { buildClock, buildTracks, reportIndexAt } from "~/lib/playback"
import {
  getRouteMode,
  getShowNoise,
  withRouteMode,
  withShowNoise,
} from "~/lib/search-params"
import { rangeFromParams, rangeKey, withRange } from "~/lib/time-range"

import type { Route } from "./+types/beacon"
import { SidePanel, useLayoutData } from "./authed-layout"

export function meta() {
  return [{ title: "History · Find My Tracker" }]
}

export async function clientLoader({
  request,
  params,
}: Route.ClientLoaderArgs) {
  const search = new URL(request.url).searchParams
  const range = rangeFromParams(search)
  const beaconId = Number(params.beaconId)
  const filters = { from: range.from, to: range.to, beaconIds: [beaconId] }
  const [history, routes] = await Promise.all([
    getLocations(filters),
    getRouteMode(search) === "reported" ? null : getRoutes(filters),
  ])
  return { beaconId, range, history, routes }
}

export default function BeaconHistory({ loaderData }: Route.ComponentProps) {
  const { beaconId, range, history, routes } = loaderData
  const { beacons, loadedAt } = useLayoutData()
  const [params, setParams] = useSearchParams()
  const [focus, setFocus] = useState<MapFocus | null>(null)
  const showNoise = getShowNoise(params)
  const beacon = beacons.find((b) => b.id === beaconId)
  const routeMode = getRouteMode(params)
  const roads =
    routeMode !== "reported" && routes?.state === "ok"
      ? routes.trips
      : undefined
  // Playback always uses the good reports, and the stays found among them; it follows the
  // roads whenever they are on the map.
  const tracks = buildTracks(history.points, history.stays, roads)
  const clock = buildClock(tracks)
  const player = usePlayback(clock, `${beaconId}|${rangeKey(range)}`)

  if (!beacon) {
    return (
      <SidePanel>
        <Card className="w-full rounded-none border-0 border-t md:w-96 md:border-t-0 md:border-l">
          <CardHeader>
            <CardTitle>Item not found</CardTitle>
            <CardDescription>
              This item doesn&apos;t exist (anymore).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link to="/">Back to the map</Link>
            </Button>
          </CardContent>
        </Card>
      </SidePanel>
    )
  }

  const kind = BEACON_KINDS[beacon.kind]
  const filters = { from: range.from, to: range.to, beaconIds: [beacon.id] }
  const good = history.points.filter((p) => !p.noise)
  const noisyCount = history.points.length - good.length
  const points = showNoise ? history.points : good
  const stays = showNoise ? [] : history.stays
  const stayIndex = indexStays(stays)
  const rowKey = (p: Schemas["LocationPoint"]) => rowKeyFor(stayIndex, p)
  const offRoute = roads
    ? roads.reduce((n, t) => n + t.reports.filter((r) => r.off_route).length, 0)
    : 0
  // While playing, the timeline follows along: the last report passed is its selected row.
  const track = tracks[0]
  const passed = track?.points[reportIndexAt(track, player.at)]
  const playbackKey = passed ? rowKey(passed) : null
  const selection = player.open
    ? playbackKey
      ? { key: playbackKey }
      : null
    : focus

  return (
    <>
      <TrackerLayers
        beacons={[beacon]}
        points={points}
        selectedId={beacon.id}
        focus={player.open ? null : focus}
        backdrop={player.open}
        pathMode={routeMode}
        roads={roads}
        onPick={(p) =>
          player.open
            ? player.seek(Date.parse(p.observed_at))
            : setFocus({
                latitude: p.latitude,
                longitude: p.longitude,
                key: rowKey(p),
                move: false,
              })
        }
        onPickSegment={({ from, to }) =>
          player.open
            ? player.seek(Date.parse(from.observed_at))
            : setFocus({
                latitude: to.latitude,
                longitude: to.longitude,
                key: rowKey(to),
                also: [rowKey(from)],
                move: false,
              })
        }
        fitKey={`${beacon.id}|${rangeKey(range)}`}
        now={loadedAt}
      />
      {player.open && (
        <>
          <PlaybackLayer
            tracks={tracks}
            beacons={[beacon]}
            at={player.at}
            playing={player.playing}
            follow={player.follow}
            bottomInset={PLAYBACK_BAR_INSET}
          />
          <PlaybackBar clock={clock} player={player} />
        </>
      )}
      <SidePanel>
        <Card className="flex min-h-0 w-full flex-col gap-4 rounded-none border-0 border-t md:h-svh md:w-96 md:border-t-0 md:border-l">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span
                className="flex size-7 items-center justify-center rounded-full text-white"
                style={{ backgroundColor: beacon.color ?? "#2563eb" }}
              >
                <kind.icon className="size-4" />
              </span>
              {beacon.name}
            </CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{kind.label}</Badge>
              {beacon.location_count.toLocaleString()} sightings stored
            </CardDescription>
            <CardAction>
              <Button
                asChild
                variant="ghost"
                size="icon-sm"
                title="Back to the map"
              >
                <Link to={{ pathname: "/", search: params.toString() }}>
                  <ArrowLeftIcon />
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <RangePicker
                range={range}
                now={loadedAt}
                onPreset={(preset) => setParams(withRange(params, { preset }))}
                onCustom={(from, to) =>
                  setParams(withRange(params, { from, to }))
                }
              />
              <Button
                variant="outline"
                size="sm"
                disabled={!player.playable}
                onClick={player.play}
              >
                <PlayIcon />
                Play
              </Button>
              <RouteModeToggle
                mode={routeMode}
                onMode={(m) => setParams(withRouteMode(params, m))}
              />
              <ExportMenu filters={filters} />
              <NoiseToggle
                pressed={showNoise}
                hiddenCount={noisyCount}
                onPressedChange={(on) => setParams(withShowNoise(params, on))}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {good.length.toLocaleString()} sighting
              {good.length === 1 ? "" : "s"} in this range
              {noisyCount > 0 &&
                !showNoise &&
                `, ${noisyCount.toLocaleString()} unlikely hidden`}
              {history.truncated && " (limit reached, narrow the range)"}
              {offRoute > 0 &&
                `. ${offRoute.toLocaleString()} off the likely route (hollow dots)`}
            </p>
            {routeMode !== "reported" && routes && (
              <RoutesNotice routes={routes} />
            )}
            <DayTimeline
              points={points}
              stays={stays}
              selection={selection}
              onSelect={(t) =>
                player.open
                  ? player.seek(Date.parse(t.at))
                  : setFocus({ ...t, move: true })
              }
            />
          </CardContent>
        </Card>
      </SidePanel>
    </>
  )
}
