import { ArrowLeftIcon } from "lucide-react"
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
import { ScrollArea } from "~/components/ui/scroll-area"
import { getLocations } from "~/features/history/api/locations"
import { DayTimeline } from "~/features/history/components/day-timeline"
import { ExportMenu } from "~/features/history/components/export-menu"
import { NoiseToggle } from "~/features/history/components/noise-toggle"
import { RangePicker } from "~/features/history/components/range-picker"
import {
  type MapFocus,
  TrackerLayers,
} from "~/features/map/components/tracker-layers"
import { BEACON_KINDS } from "~/lib/beacon-kind"
import { getShowNoise, withShowNoise } from "~/lib/search-params"
import { rangeFromParams, withRange } from "~/lib/time-range"

import type { Route } from "./+types/beacon"
import { SidePanel, useLayoutData } from "./authed-layout"

export function meta() {
  return [{ title: "History · Find My Tracker" }]
}

export async function clientLoader({
  request,
  params,
}: Route.ClientLoaderArgs) {
  const range = rangeFromParams(new URL(request.url).searchParams)
  const beaconId = Number(params.beaconId)
  const history = await getLocations({
    from: range.from,
    to: range.to,
    beaconIds: [beaconId],
  })
  return { beaconId, range, history }
}

export default function BeaconHistory({ loaderData }: Route.ComponentProps) {
  const { beaconId, range, history } = loaderData
  const { beacons, loadedAt } = useLayoutData()
  const [params, setParams] = useSearchParams()
  const [focus, setFocus] = useState<MapFocus | null>(null)
  const showNoise = getShowNoise(params)
  const beacon = beacons.find((b) => b.id === beaconId)

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
  // The timeline row a report is shown in: its stay, if it's part of one.
  const rowKey = (p: { observed_at: string }) => {
    const stay = stays.find(
      (s) => p.observed_at >= s.arrived_at && p.observed_at <= s.left_at
    )
    return stay ? `stay-${stay.arrived_at}` : p.observed_at
  }

  return (
    <>
      <TrackerLayers
        beacons={[beacon]}
        points={points}
        selectedId={beacon.id}
        focus={focus}
        onPick={(p) =>
          setFocus({
            latitude: p.latitude,
            longitude: p.longitude,
            key: rowKey(p),
            move: false,
          })
        }
        onPickSegment={({ from, to }) =>
          setFocus({
            latitude: to.latitude,
            longitude: to.longitude,
            key: rowKey(to),
            also: [rowKey(from)],
            move: false,
          })
        }
        fitKey={`${beacon.id}|${range.preset}|${range.from.toISOString().slice(0, 10)}`}
        now={loadedAt}
      />
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
                onPreset={(preset) => setParams(withRange(params, { preset }))}
                onCustom={(from, to) =>
                  setParams(withRange(params, { from, to }))
                }
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
            </p>
            <ScrollArea className="min-h-0 flex-1 pr-3">
              <DayTimeline
                points={points}
                stays={stays}
                selection={focus}
                onSelect={(t) => setFocus({ ...t, move: true })}
              />
            </ScrollArea>
          </CardContent>
        </Card>
      </SidePanel>
    </>
  )
}
