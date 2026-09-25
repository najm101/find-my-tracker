import { MousePointerClickIcon } from "lucide-react"

import { Button } from "~/components/ui/button"
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
import { dateTime, durationBetween } from "~/lib/format"
import { cn } from "~/lib/utils"

import { visitKey } from "../inside"

type Visit = Schemas["Visit"]

type Props = {
  place: { lat: number; lon: number } | null
  radiusM: number
  visits: Visit[] | null
  beacons: Schemas["BeaconOut"][]
  /** Sightings inside the circle, as drawn on the map. */
  insideCount: number
  /** The visit picked, whose sightings alone are highlighted. */
  selected: string | null
  onSelect: (visit: Visit | null) => void
  /** While the slider moves; `onRadiusCommit` once it's let go. */
  onRadius: (radiusM: number) => void
  onRadiusCommit: (radiusM: number) => void
  children?: React.ReactNode
}

/**
 * Who was near a place, and when. The map highlights the sightings inside the circle; picking a
 * visit here highlights only its own.
 */
export function PlacesPanel({
  place,
  radiusM,
  visits,
  beacons,
  insideCount,
  selected,
  onSelect,
  onRadius,
  onRadiusCommit,
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
            onValueCommit={([v]) => onRadiusCommit(v)}
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
          <>
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {insideCount.toLocaleString()} sighting
                {insideCount === 1 ? "" : "s"} inside, highlighted on the map
              </span>
              {selected && (
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() => onSelect(null)}
                >
                  Show all
                </Button>
              )}
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <ItemGroup className="gap-2">
                {visits?.map((v) => {
                  const b = byId.get(v.beacon_id)
                  const key = visitKey(v)
                  const chosen = key === selected
                  return (
                    <Item
                      key={key}
                      variant="outline"
                      size="sm"
                      asChild
                      className={cn(
                        "text-left hover:bg-muted",
                        chosen &&
                          "border-primary bg-primary/10 hover:bg-primary/15"
                      )}
                    >
                      <button
                        type="button"
                        aria-pressed={chosen}
                        onClick={() => onSelect(chosen ? null : v)}
                      >
                        <ItemContent>
                          <ItemTitle>
                            <span
                              className="size-2.5 rounded-full"
                              style={{
                                backgroundColor: b?.color ?? "#2563eb",
                              }}
                            />
                            {b?.name ?? "Unknown item"}
                          </ItemTitle>
                          <ItemDescription>
                            {dateTime(v.arrived_at)} ·{" "}
                            {durationBetween(v.arrived_at, v.left_at)} ·{" "}
                            {v.point_count} sighting
                            {v.point_count === 1 ? "" : "s"}, closest{" "}
                            {Math.round(v.closest_m)} m
                          </ItemDescription>
                        </ItemContent>
                      </button>
                    </Item>
                  )
                })}
              </ItemGroup>
            </ScrollArea>
          </>
        )}
      </CardContent>
    </Card>
  )
}
