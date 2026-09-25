import { EllipsisIcon, PencilIcon, PlayIcon, XIcon } from "lucide-react"
import { useState } from "react"
import { Link, useSearchParams } from "react-router"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { BeaconEditDialog } from "~/features/beacons/components/beacon-edit-dialog"
import { getLocations } from "~/features/history/api/locations"
import { DayTimeline } from "~/features/history/components/day-timeline"
import { ExportMenuItems } from "~/features/history/components/export-menu"
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
import { startRoutes } from "~/features/routing/api/routing"
import { RouteModeToggle } from "~/features/routing/components/route-mode-toggle"
import { RoutesNotice } from "~/features/routing/components/routes-notice"
import { usePredictedRoutes } from "~/features/routing/hooks/use-predicted-routes"
import { usePendingSearchParams } from "~/hooks/use-pending-search-params"
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
  // Predicted routes can take a while to find: the page shows without them and they follow.
  const routes =
    getRouteMode(search) === "reported" ? null : startRoutes(filters)
  const history = await getLocations(filters)
  return { beaconId, range, history, routes }
}

export default function BeaconHistory({ loaderData }: Route.ComponentProps) {
  const { beaconId, range, history } = loaderData
  const { beacons, loadedAt } = useLayoutData()
  const [params, setParams] = useSearchParams()
  const [focus, setFocus] = useState<MapFocus | null>(null)
  const [editing, setEditing] = useState(false)
  const showNoise = getShowNoise(params)
  const beacon = beacons.find((b) => b.id === beaconId)
  const routeMode = getRouteMode(params)
  const {
    routes,
    fresh,
    loading: routesLoading,
  } = usePredictedRoutes(
    loaderData.routes,
    { from: range.from, to: range.to, beaconIds: [beaconId] },
    `${beaconId}|${rangeKey(range)}`
  )
  // The path mode just picked shows at once: a spinner until its routes start coming, then how
  // far along finding them is. The map shows each trip as it comes, and works meanwhile.
  const shownMode = getRouteMode(usePendingSearchParams())
  const predicting = routesLoading || !!routes?.progress
  const settled = !routesLoading && shownMode === routeMode
  const predicted =
    routeMode !== "reported" && routes?.state === "ok"
      ? routes.trips
      : undefined
  // Playback always uses the good reports, and the stays found among them; it follows the
  // predicted routes whenever they are on the map, as far as they are found.
  const tracks = buildTracks(history.points, history.stays, predicted)
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
  const offRoute = predicted
    ? predicted.reduce(
        (n, t) => n + t.reports.filter((r) => r.off_route).length,
        0
      )
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
        predicted={predicted}
        predicting={predicting}
        drawIn={fresh}
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
        <Card className="flex min-h-0 w-full flex-col gap-3 rounded-none border-0 border-t md:h-svh md:w-96 md:border-t-0 md:border-l">
          <CardHeader>
            <CardTitle className="flex min-w-0 items-center gap-2">
              <span
                className="flex size-7 shrink-0 items-center justify-center rounded-full text-white"
                style={{ backgroundColor: beacon.color ?? "#2563eb" }}
              >
                {beacon.emoji ? (
                  <span className="text-sm">{beacon.emoji}</span>
                ) : (
                  <kind.icon className="size-4" />
                )}
              </span>
              <span className="truncate">{beacon.name}</span>
            </CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{kind.label}</Badge>
              {beacon.location_count.toLocaleString()} stored
            </CardDescription>
            <CardAction className="flex items-center gap-0.5">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="More">
                    <EllipsisIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onSelect={() => setEditing(true)}>
                    <PencilIcon />
                    Edit item
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <ExportMenuItems filters={filters} />
                </DropdownMenuContent>
              </DropdownMenu>
              <Button asChild variant="ghost" size="icon-sm" aria-label="Close">
                <Link to={{ pathname: "/", search: params.toString() }}>
                  <XIcon />
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-2">
            <RangePicker
              fill
              range={range}
              now={loadedAt}
              onPreset={(preset) => setParams(withRange(params, { preset }))}
              onCustom={(from, to) =>
                setParams(withRange(params, { from, to }))
              }
            />
            <p className="text-xs text-muted-foreground">
              {good.length.toLocaleString()} sighting
              {good.length === 1 ? "" : "s"} in this range
              {history.truncated && " (limit reached, narrow the range)"}
              {noisyCount > 0 && " · "}
              <NoiseToggle
                inline
                pressed={showNoise}
                hiddenCount={noisyCount}
                onPressedChange={(on) => setParams(withShowNoise(params, on))}
              />
              {offRoute > 0 &&
                ` · ${offRoute.toLocaleString()} off the predicted route (hollow dots)`}
            </p>
            {shownMode !== "reported" && <RoutesNotice routes={routes} />}
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
          <CardFooter className="gap-2">
            <RouteModeToggle
              mode={shownMode}
              busy={shownMode !== "reported" && (predicting || !settled)}
              progress={settled ? (routes?.progress?.done ?? null) : null}
              onMode={(m) => setParams(withRouteMode(params, m))}
            />
            <Button
              size="sm"
              className="ml-auto"
              disabled={!player.playable}
              onClick={player.play}
            >
              <PlayIcon />
              Play
            </Button>
          </CardFooter>
        </Card>
      </SidePanel>
      <BeaconEditDialog
        beacon={editing ? beacon : null}
        onOpenChange={setEditing}
      />
    </>
  )
}
