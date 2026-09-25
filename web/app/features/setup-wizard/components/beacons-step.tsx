import { TriangleAlertIcon } from "lucide-react"
import { useState } from "react"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "~/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { Spinner } from "~/components/ui/spinner"
import type { Schemas } from "~/lib/api/client"
import { BEACON_KINDS } from "~/lib/beacon-kind"
import { DEFAULT_POLL_MINUTES, POLL_INTERVALS } from "~/lib/poll-intervals"

type Props = {
  busy: boolean
  beacons: Schemas["CandidateOut"][]
  /** Adding to a connected account: tracked items are locked, the interval is left alone. */
  adding: boolean
  onSubmit: (identifiers: string[], intervalMinutes: number | null) => void
}

export function BeaconsStep({ busy, beacons, adding, onSubmit }: Props) {
  // Personal devices (iPhone, Mac…) start unticked: tracking one tracks a person.
  const [selected, setSelected] = useState(
    () =>
      new Set(
        beacons
          .filter((b) =>
            adding ? b.already_tracked : !b.personal_device || b.already_tracked
          )
          .map((b) => b.identifier)
      )
  )
  const [interval, setInterval] = useState(String(DEFAULT_POLL_MINUTES))

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  const personalSelected = beacons.some(
    (b) => b.personal_device && !b.already_tracked && selected.has(b.identifier)
  )
  // When adding, only the new ones are sent; tracked items are already stored.
  const toSubmit = [...selected].filter(
    (id) =>
      !adding || !beacons.find((b) => b.identifier === id)?.already_tracked
  )
  const label = adding
    ? toSubmit.length
      ? `Add ${toSubmit.length} item${toSubmit.length === 1 ? "" : "s"}`
      : "Nothing new selected"
    : `Track ${toSubmit.length} item${toSubmit.length === 1 ? "" : "s"}`

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(toSubmit, adding ? null : Number(interval))
      }}
    >
      <FieldGroup>
        <FieldSet>
          <FieldLegend variant="label">What should be tracked?</FieldLegend>
          <FieldDescription>
            Found {beacons.length} item{beacons.length === 1 ? "" : "s"} on your
            account.
          </FieldDescription>
          <FieldGroup className="gap-2">
            {beacons.map((b) => {
              const kind = BEACON_KINDS[b.kind]
              return (
                <FieldLabel
                  key={b.identifier}
                  htmlFor={`beacon-${b.identifier}`}
                >
                  <Field orientation="horizontal">
                    <Checkbox
                      id={`beacon-${b.identifier}`}
                      checked={selected.has(b.identifier)}
                      disabled={adding && b.already_tracked}
                      onCheckedChange={(v) => toggle(b.identifier, v === true)}
                    />
                    <FieldContent>
                      <FieldTitle>
                        <kind.icon className="size-4 text-muted-foreground" />
                        {b.name}
                        {b.already_tracked && (
                          <Badge variant="secondary">Tracked</Badge>
                        )}
                      </FieldTitle>
                      <FieldDescription>
                        {kind.label}
                        {b.model && b.kind !== "airtag" ? ` · ${b.model}` : ""}
                      </FieldDescription>
                    </FieldContent>
                    {b.personal_device && (
                      <Badge variant="outline">Personal device</Badge>
                    )}
                  </Field>
                </FieldLabel>
              )
            })}
          </FieldGroup>
        </FieldSet>

        {personalSelected && (
          <p className="flex gap-2 text-sm text-muted-foreground">
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
            Tracking a phone or computer records where its owner goes. Only do
            this for your own devices.
          </p>
        )}

        {!adding && (
          <Field>
            <FieldLabel htmlFor="interval">How often to check</FieldLabel>
            <Select value={interval} onValueChange={setInterval}>
              <SelectTrigger id="interval" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POLL_INTERVALS.map((i) => (
                  <SelectItem key={i.minutes} value={String(i.minutes)}>
                    {i.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>
              Apple keeps about 7 days of reports and every check collects all
              of them, so history is complete at any interval under a week.
              Every 30 minutes keeps the map current; once a day is enough if
              you only need the history. You can change it later in Settings.
            </FieldDescription>
          </Field>
        )}

        <Button
          type="submit"
          disabled={busy || toSubmit.length === 0}
          className="self-end"
        >
          {busy && <Spinner />}
          {label}
        </Button>
      </FieldGroup>
    </form>
  )
}
