import { LayersIcon } from "lucide-react"
import { useState } from "react"

import { Button } from "~/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet"
import type { Schemas } from "~/lib/api/client"

import { BeaconNav } from "./beacon-nav"

type Props = {
  beacons: Schemas["BeaconOut"][]
  hidden: Set<number>
  activeId: number | null
  now: number
  onToggle: (id: number) => void
  onSetHidden: (ids: number[]) => void
}

/**
 * The tracked items on a phone. They live in the sidebar on a desktop, but a phone has no room
 * for one beside the map, so they come up from the bottom over it — close to the thumb, and
 * dismissed without leaving the map.
 */
export function MobileItemsSheet({
  beacons,
  hidden,
  activeId,
  now,
  onToggle,
  onSetHidden,
}: Props) {
  const [open, setOpen] = useState(false)
  const shown = beacons.length - hidden.size

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-10 gap-2 bg-background/90 shadow-sm backdrop-blur"
      >
        <LayersIcon />
        Items
        <span className="text-muted-foreground tabular-nums">
          {shown}/{beacons.length}
        </span>
      </Button>
      <SheetContent
        side="bottom"
        className="max-h-[70svh] overflow-y-auto pb-[env(safe-area-inset-bottom)]"
      >
        <SheetHeader className="pb-0">
          <SheetTitle>Items</SheetTitle>
          <SheetDescription>
            Tap one for its history, or hide it from the map.
          </SheetDescription>
        </SheetHeader>
        {/* Closing on pick keeps the map visible; toggling visibility deliberately does not. */}
        <div
          onClick={(e) =>
            e.target instanceof HTMLAnchorElement && setOpen(false)
          }
        >
          <BeaconNav
            beacons={beacons}
            hidden={hidden}
            activeId={activeId}
            now={now}
            onToggle={onToggle}
            onSetHidden={onSetHidden}
            addHref="/setup"
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
