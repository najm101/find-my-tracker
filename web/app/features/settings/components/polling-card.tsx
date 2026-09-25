import { InfoIcon } from "lucide-react"

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
import { DAY, POLL_INTERVALS } from "~/lib/poll-intervals"

import { updateSettings } from "../api/settings"

type Props = {
  settings: Schemas["AppSettings"]
  status: Schemas["TrackingStatus"]
  now: number
}

export function PollingCard({ settings, status, now }: Props) {
  const { run, pending } = useMutation()
  const interval = settings.poll_interval_minutes

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
              {POLL_INTERVALS.map((i) => (
                <SelectItem key={i.minutes} value={String(i.minutes)}>
                  {i.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>
            Apple keeps about seven days of reports and every check collects all
            of them, so history stays complete at any interval under a week.
            Every 30 minutes keeps the map current; once a day is enough if you
            only need the history, and asks Apple far less often.
            {status.next_run_at && !status.running && (
              <> Next check {timeAgo(status.next_run_at, now)}.</>
            )}
          </FieldDescription>
        </Field>
        {interval > DAY && (
          <Alert>
            <InfoIcon />
            <AlertTitle>Less room for a missed check</AlertTitle>
            <AlertDescription>
              A check that fails is tried again an hour later. But while the
              server is off, or Apple wants you to sign in again, nothing is
              collected, and reports more than a week old by the next check are
              gone.
              {interval >= 7 * DAY &&
                " Checking weekly, the oldest reports can age out even when nothing goes wrong."}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
