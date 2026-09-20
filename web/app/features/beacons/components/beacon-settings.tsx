import { MoreHorizontalIcon, PencilIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "~/components/ui/empty"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "~/components/ui/item"
import { Switch } from "~/components/ui/switch"
import { useMutation } from "~/hooks/use-mutation"
import type { Schemas } from "~/lib/api/client"
import { BEACON_KINDS, DEFAULT_BEACON_COLOR } from "~/lib/beacon-kind"
import { cn } from "~/lib/utils"

import { deleteBeacon, updateBeacon } from "../api/beacons"
import { BeaconEditDialog } from "./beacon-edit-dialog"

type Beacon = Schemas["BeaconOut"]

export function BeaconSettings({ beacons }: { beacons: Beacon[] }) {
  const { run, pending } = useMutation()
  const [editing, setEditing] = useState<Beacon | null>(null)
  const [removing, setRemoving] = useState<Beacon | null>(null)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Items</CardTitle>
        <CardDescription>
          Rename items, give them a colour on the map, or stop checking one
          without losing its history.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {beacons.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No items yet</EmptyTitle>
              <EmptyDescription>
                Connect your Apple account to pick the items to track.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ItemGroup>
            {beacons.map((beacon) => {
              const kind = BEACON_KINDS[beacon.kind]
              return (
                <Item key={beacon.id} variant="outline">
                  <ItemMedia>
                    <span
                      className={cn(
                        "flex size-9 items-center justify-center rounded-full text-white",
                        !beacon.enabled && "opacity-40"
                      )}
                      style={{
                        backgroundColor: beacon.color ?? DEFAULT_BEACON_COLOR,
                      }}
                    >
                      {beacon.emoji ? (
                        <span className="text-base">{beacon.emoji}</span>
                      ) : (
                        <kind.icon className="size-4" />
                      )}
                    </span>
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{beacon.name}</ItemTitle>
                    <ItemDescription>
                      {kind.label} · {beacon.location_count.toLocaleString()}{" "}
                      sightings
                      {beacon.name !== beacon.apple_name && (
                        <> · Apple calls it “{beacon.apple_name}”</>
                      )}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Switch
                      checked={beacon.enabled}
                      disabled={pending}
                      aria-label={`Keep checking ${beacon.name}`}
                      onCheckedChange={(enabled) =>
                        run(
                          () => updateBeacon(beacon.id, { enabled }),
                          enabled
                            ? `Checking ${beacon.name} again.`
                            : `Paused ${beacon.name}.`
                        )
                      }
                    />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm">
                          <MoreHorizontalIcon />
                          <span className="sr-only">
                            More options for {beacon.name}
                          </span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setEditing(beacon)}>
                          <PencilIcon />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => setRemoving(beacon)}
                        >
                          <Trash2Icon />
                          Remove
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </ItemActions>
                </Item>
              )
            })}
          </ItemGroup>
        )}
      </CardContent>

      <BeaconEditDialog
        beacon={editing}
        onOpenChange={(open) => !open && setEditing(null)}
      />

      <AlertDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the item and all{" "}
              {removing?.location_count.toLocaleString()} sightings stored for
              it. It cannot be undone, though you can add the item again from
              your Apple account — its history will start over.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const beacon = removing
                if (beacon)
                  run(() => deleteBeacon(beacon.id), `Removed ${beacon.name}.`)
              }}
            >
              Remove and delete history
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
