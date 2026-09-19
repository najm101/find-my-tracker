import { MousePointerClickIcon } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "~/components/ui/empty"
import { Field, FieldLabel } from "~/components/ui/field"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "~/components/ui/item"
import { ScrollArea } from "~/components/ui/scroll-area"
import { Slider } from "~/components/ui/slider"
import type { Schemas } from "~/lib/api/client"
import { dateTime } from "~/lib/format"

type Props = {
  place: { lat: number; lon: number } | null
  radiusM: number
  visits: Schemas["Visit"][] | null
  beacons: Schemas["BeaconOut"][]
  onRadius: (radiusM: number) => void
  children?: React.ReactNode
}

function duration(from: string, to: string): string {
  const minutes = Math.round(
    (new Date(to).getTime() - new Date(from).getTime()) / 60_000
  )
  if (minutes < 1) return "a moment"
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  return `${h} h ${minutes % 60} min`
}

export function PlacesPanel({
  place,
  radiusM,
  visits,
  beacons,
  onRadius,
  children,
}: Props) {
  const byId = new Map(beacons.map((b) => [b.id, b]))

  return (
    <Card className="flex max-h-full w-full flex-col gap-4 sm:w-80">
      <CardHeader>
        <CardTitle>Near a place</CardTitle>
        <CardDescription>
          {place
            ? `${place.lat.toFixed(5)}, ${place.lon.toFixed(5)}`
            : "Click the map to pick a place."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-col gap-4">
        <Field>
          <FieldLabel>
            Within {radiusM >= 1000 ? `${radiusM / 1000} km` : `${radiusM} m`}
          </FieldLabel>
          <Slider
            min={50}
            max={2000}
            step={50}
            value={[radiusM]}
            onValueChange={([v]) => onRadius(v)}
          />
        </Field>
        {children}
        {!place ? (
          <Empty className="border">
            <EmptyHeader>
              <MousePointerClickIcon className="size-5 text-muted-foreground" />
              <EmptyTitle>Pick a place</EmptyTitle>
              <EmptyDescription>
                Click anywhere on the map to see when your items were there.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : visits && visits.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No visits in this time range.
          </p>
        ) : (
          <ScrollArea className="min-h-0 flex-1">
            <ItemGroup className="gap-2">
              {visits?.map((v) => {
                const b = byId.get(v.beacon_id)
                return (
                  <Item
                    key={`${v.beacon_id}-${v.arrived_at}`}
                    variant="outline"
                    size="sm"
                  >
                    <ItemContent>
                      <ItemTitle>
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: b?.color ?? "#2563eb" }}
                        />
                        {b?.name ?? "Unknown item"}
                      </ItemTitle>
                      <ItemDescription>
                        {dateTime(v.arrived_at)} ·{" "}
                        {duration(v.arrived_at, v.left_at)} · {v.point_count}{" "}
                        sighting{v.point_count === 1 ? "" : "s"}, closest{" "}
                        {Math.round(v.closest_m)} m
                      </ItemDescription>
                    </ItemContent>
                  </Item>
                )
              })}
            </ItemGroup>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}
