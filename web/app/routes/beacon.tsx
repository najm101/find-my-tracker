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
import { RangePicker } from "~/features/history/components/range-picker"
import { TrackerMap } from "~/features/map/components/tracker-map"
import { BEACON_KINDS } from "~/lib/beacon-kind"
import { rangeFromParams, withRange } from "~/lib/time-range"

import type { Route } from "./+types/beacon"
import { useLayoutData } from "./authed-layout"

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
  const [focus, setFocus] = useState<{
    latitude: number
    longitude: number
    key: string
  } | null>(null)
  const beacon = beacons.find((b) => b.id === beaconId)

  if (!beacon) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
        <p className="text-muted-foreground">
          This item doesn&apos;t exist (anymore).
        </p>
        <Button asChild variant="outline">
          <Link to="/">Back to the map</Link>
        </Button>
      </main>
    )
  }

  const kind = BEACON_KINDS[beacon.kind]
  const filters = { from: range.from, to: range.to, beaconIds: [beacon.id] }

  return (
    <div className="relative flex h-svh w-full flex-col md:flex-row">
      <div className="relative min-h-[45svh] flex-1">
        <TrackerMap
          className="absolute inset-0"
          beacons={[beacon]}
          points={history.points}
          selectedId={beacon.id}
          focus={focus}
          fitKey={`${beacon.id}|${range.preset}|${range.from.toISOString().slice(0, 10)}`}
          now={loadedAt}
        />
      </div>
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
          </div>
          <p className="text-xs text-muted-foreground">
            {history.points.length.toLocaleString()} sighting
            {history.points.length === 1 ? "" : "s"} in this range
            {history.truncated && " (limit reached, narrow the range)"}
          </p>
          <ScrollArea className="min-h-0 flex-1 pr-3">
            <DayTimeline
              points={history.points}
              selected={focus?.key}
              onSelect={(p) =>
                setFocus({
                  latitude: p.latitude,
                  longitude: p.longitude,
                  key: p.observed_at,
                })
              }
            />
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}
