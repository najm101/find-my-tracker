import { TriangleAlertIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { Field, FieldDescription, FieldLabel } from "~/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { useMutation } from "~/hooks/use-mutation"
import type { Schemas } from "~/lib/api/client"
import { timeAgo } from "~/lib/format"

import { updateSettings } from "../api/settings"

/** Only *shorter* intervals risk an Apple ban; longer ones only make the latest fix older. */
const INTERVALS = [
  { minutes: 15, label: "Every 15 minutes" },
  { minutes: 30, label: "Every 30 minutes (recommended)" },
  { minutes: 60, label: "Every hour" },
  { minutes: 120, label: "Every 2 hours" },
  { minutes: 360, label: "Every 6 hours" },
  { minutes: 720, label: "Every 12 hours" },
  { minutes: 1440, label: "Once a day" },
]

const RECOMMENDED = 30

type Props = {
  settings: Schemas["AppSettings"]
  status: Schemas["TrackingStatus"]
  now: number
}

export function PollingCard({ settings, status, now }: Props) {
  const { run, pending } = useMutation()
  const interval = settings.poll_interval_minutes
  const risky = interval < RECOMMENDED

  return (
    <Card>
      <CardHeader>
        <CardTitle>Checking for locations</CardTitle>
        <CardDescription>
          How often the server asks Apple where your items are.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Field>
          <FieldLabel htmlFor="poll-interval">Check interval</FieldLabel>
          <Select
            value={String(interval)}
            disabled={pending}
            onValueChange={(value) =>
              run(
                () => updateSettings({ poll_interval_minutes: Number(value) }),
                "Check interval saved."
              )
            }
          >
            <SelectTrigger id="poll-interval" className="w-full sm:w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INTERVALS.map((i) => (
                <SelectItem key={i.minutes} value={String(i.minutes)}>
                  {i.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>
            Apple returns about seven days of reports every time, so your
            history stays complete at any interval under a week. The interval
            only decides how fresh the latest position is.
            {status.next_run_at && !status.running && (
              <> Next check {timeAgo(status.next_run_at, now)}.</>
            )}
          </FieldDescription>
        </Field>
        {risky && (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertTitle>Checking this often raises the risk</AlertTitle>
            <AlertDescription>
              Apple rate-limits and occasionally locks accounts that query the
              Find My network too often. 30 minutes is the recommended floor.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
