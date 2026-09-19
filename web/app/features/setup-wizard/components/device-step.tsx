import { LaptopIcon, SmartphoneIcon, TabletIcon } from "lucide-react"
import { useState } from "react"

import { Button } from "~/components/ui/button"
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
import { Input } from "~/components/ui/input"
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group"
import { Spinner } from "~/components/ui/spinner"
import type { Schemas } from "~/lib/api/client"
import { date } from "~/lib/format"

type Props = {
  busy: boolean
  devices: Schemas["DeviceOut"][]
  attemptsLeft: number | null | undefined
  /** Changes after each rejected attempt; clears the passcode but keeps the device. */
  resetKey: number
  onSubmit: (deviceId: string, passcode: string) => void
}

function deviceIcon(model: string | null | undefined) {
  const m = (model ?? "").toLowerCase()
  if (m.startsWith("ipad")) return TabletIcon
  if (m.startsWith("mac")) return LaptopIcon
  return SmartphoneIcon
}

export function DeviceStep({
  busy,
  devices,
  attemptsLeft,
  resetKey,
  onSubmit,
}: Props) {
  const [deviceId, setDeviceId] = useState(devices[0]?.id ?? "")
  const [passcode, setPasscode] = useState("")
  const [seenReset, setSeenReset] = useState(resetKey)
  if (seenReset !== resetKey) {
    setSeenReset(resetKey)
    setPasscode("")
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(deviceId, passcode)
      }}
    >
      <FieldGroup>
        <FieldSet>
          <FieldLegend variant="label">
            Which device&apos;s passcode do you know?
          </FieldLegend>
          <FieldDescription>
            Apple keeps your beacon keys in iCloud Keychain, locked behind the
            screen-lock passcode of one of your devices.
          </FieldDescription>
          <RadioGroup value={deviceId} onValueChange={setDeviceId}>
            {devices.map((d) => {
              const Icon = deviceIcon(d.model)
              return (
                <FieldLabel key={d.id} htmlFor={`device-${d.id}`}>
                  <Field orientation="horizontal">
                    <Icon className="size-4 text-muted-foreground" />
                    <FieldContent>
                      <FieldTitle>{d.name}</FieldTitle>
                      <FieldDescription>
                        {[d.model, d.added_at && `added ${date(d.added_at)}`]
                          .filter(Boolean)
                          .join(" · ")}
                      </FieldDescription>
                    </FieldContent>
                    <RadioGroupItem value={d.id} id={`device-${d.id}`} />
                  </Field>
                </FieldLabel>
              )
            })}
          </RadioGroup>
        </FieldSet>
        <Field>
          <FieldLabel htmlFor="passcode">Screen-lock passcode</FieldLabel>
          <Input
            id="passcode"
            type="password"
            inputMode="text"
            autoComplete="off"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            required
          />
          <FieldDescription>
            The PIN or login password of that device, <strong>not</strong> your
            Apple ID password. Used once and never stored.
            {attemptsLeft != null && attemptsLeft < 3 && (
              <>
                {" "}
                {attemptsLeft} attempt{attemptsLeft === 1 ? "" : "s"} left.
              </>
            )}
          </FieldDescription>
        </Field>
        <Button
          type="submit"
          disabled={busy || !deviceId || !passcode}
          className="self-end"
        >
          {busy && <Spinner />}
          Unlock
        </Button>
      </FieldGroup>
    </form>
  )
}
