import { CheckIcon } from "lucide-react"
import { useState } from "react"

import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { Spinner } from "~/components/ui/spinner"
import { Switch } from "~/components/ui/switch"
import { useMutation } from "~/hooks/use-mutation"
import type { Schemas } from "~/lib/api/client"
import { BEACON_COLORS, DEFAULT_BEACON_COLOR } from "~/lib/beacon-kind"
import { cn } from "~/lib/utils"

import { updateBeacon } from "../api/beacons"

type Beacon = Schemas["BeaconOut"]

/** Rename an item, give it an emoji, pick its colour on the map, and say if it's in a vehicle. */
export function BeaconEditDialog({
  beacon,
  onOpenChange,
}: {
  beacon: Beacon | null
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={beacon !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Remount per item so the fields start from that item's values. */}
        {beacon && (
          <EditForm
            key={beacon.id}
            beacon={beacon}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function EditForm({ beacon, onDone }: { beacon: Beacon; onDone: () => void }) {
  const { run, pending } = useMutation()
  const [name, setName] = useState(
    beacon.name === beacon.apple_name ? "" : beacon.name
  )
  const [emoji, setEmoji] = useState(beacon.emoji ?? "")
  const [color, setColor] = useState(beacon.color ?? DEFAULT_BEACON_COLOR)
  const [vehicle, setVehicle] = useState(beacon.vehicle)

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        const ok = await run(
          () =>
            updateBeacon(beacon.id, {
              display_name: name.trim(),
              emoji: emoji.trim(),
              color,
              vehicle,
            }),
          "Item saved."
        )
        if (ok) onDone()
      }}
    >
      <DialogHeader>
        <DialogTitle>Edit {beacon.name}</DialogTitle>
        <DialogDescription>
          Only this app sees these. Nothing is sent to Apple.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup className="py-4">
        <Field>
          <FieldLabel htmlFor="beacon-name">Name</FieldLabel>
          <Input
            id="beacon-name"
            value={name}
            maxLength={200}
            placeholder={beacon.apple_name}
            onChange={(e) => setName(e.target.value)}
          />
          <FieldDescription>
            Leave empty to use the name from your Apple account.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="beacon-emoji">Emoji</FieldLabel>
          <Input
            id="beacon-emoji"
            value={emoji}
            maxLength={16}
            placeholder="🎒"
            className="w-24"
            onChange={(e) => setEmoji(e.target.value)}
          />
          <FieldDescription>
            Shown on the map instead of the item&apos;s icon.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel id="beacon-colour-label">Colour</FieldLabel>
          <div
            role="radiogroup"
            aria-labelledby="beacon-colour-label"
            className="flex flex-wrap gap-2"
          >
            {BEACON_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={c === color}
                aria-label={`Colour ${c}`}
                onClick={() => setColor(c)}
                style={{ backgroundColor: c }}
                className={cn(
                  "flex size-8 items-center justify-center rounded-full text-white",
                  "outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring",
                  c === color && "outline-2 outline-foreground"
                )}
              >
                {c === color && <CheckIcon className="size-4" />}
              </button>
            ))}
          </div>
          <FieldDescription>
            Used for this item&apos;s pin and path on the map.
          </FieldDescription>
        </Field>
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor="beacon-vehicle">Lives in a vehicle</FieldLabel>
            <FieldDescription>
              For an item left in a car, bike or van. Its predicted routes then
              follow roads a car can use, however slowly it seemed to move.
            </FieldDescription>
          </FieldContent>
          <Switch
            id="beacon-vehicle"
            checked={vehicle}
            onCheckedChange={setVehicle}
          />
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Spinner />}
          Save
        </Button>
      </DialogFooter>
    </form>
  )
}
