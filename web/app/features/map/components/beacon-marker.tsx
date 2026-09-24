import { Link } from "react-router"

import { Button } from "~/components/ui/button"
import { MapMarker, MarkerContent, MarkerPopup } from "~/components/ui/map"
import type { Schemas } from "~/lib/api/client"
import { BEACON_KINDS } from "~/lib/beacon-kind"
import { dateTime, timeAgo } from "~/lib/format"
import { cn } from "~/lib/utils"

type Props = {
  beacon: Schemas["BeaconOut"]
  /** Where to draw it; defaults to the beacon's latest position. */
  position?: {
    latitude: number
    longitude: number
    observed_at: string
    accuracy_m: number | null
  }
  selected?: boolean
  now: number
}

export function BeaconMarker({ beacon, position, selected, now }: Props) {
  const at = position ?? beacon.latest
  if (!at) return null

  return (
    <MapMarker longitude={at.longitude} latitude={at.latitude}>
      <MarkerContent>
        <BeaconBubble beacon={beacon} selected={selected} />
      </MarkerContent>
      <MarkerPopup className="w-60 p-3">
        <div className="flex flex-col gap-1 text-sm">
          <p className="font-medium">{beacon.name}</p>
          <p className="text-muted-foreground" title={dateTime(at.observed_at)}>
            Seen {timeAgo(at.observed_at, now)}
            {at.accuracy_m != null && <> · ±{at.accuracy_m} m</>}
          </p>
          <Button asChild size="sm" variant="outline" className="mt-2">
            <Link to={`/beacons/${beacon.id}`}>History</Link>
          </Button>
        </div>
      </MarkerPopup>
    </MapMarker>
  )
}

/** The round badge in the item's colour, with its emoji or its kind's icon. */
export function BeaconBubble({
  beacon,
  selected,
}: {
  beacon: Schemas["BeaconOut"]
  selected?: boolean
}) {
  const kind = BEACON_KINDS[beacon.kind]
  return (
    <div
      className={cn(
        "flex size-8 items-center justify-center rounded-full border-2 border-background text-white shadow-md transition-transform",
        selected && "scale-125 ring-2 ring-foreground/40"
      )}
      style={{ backgroundColor: beacon.color ?? "#2563eb" }}
      aria-label={beacon.name}
    >
      {beacon.emoji ? (
        <span className="text-sm leading-none">{beacon.emoji}</span>
      ) : (
        <kind.icon className="size-4" />
      )}
    </div>
  )
}
