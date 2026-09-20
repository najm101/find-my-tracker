import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { listPollRuns } from "~/features/tracking/api/tracking"
import { CoverageNote } from "~/features/tracking/components/coverage-note"
import { PollRunsTable } from "~/features/tracking/components/poll-runs-table"
import { RefreshButton } from "~/features/tracking/components/refresh-button"
import { dateTime, timeAgo } from "~/lib/format"

import type { Route } from "./+types/status"
import { useLayoutData } from "./authed-layout"

export function meta() {
  return [{ title: "Status · Find My Tracker" }]
}

export async function clientLoader() {
  return { runs: await listPollRuns() }
}

export default function Status({ loaderData }: Route.ComponentProps) {
  const { runs } = loaderData
  const { status, beacons, loadedAt } = useLayoutData()
  const tracked = beacons.filter((b) => b.enabled).length
  const stored = beacons.reduce((sum, b) => sum + b.location_count, 0)

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 pt-16 pb-16 md:p-8">
      <header>
        <h1 className="text-2xl font-semibold">Status</h1>
        <p className="text-muted-foreground">
          Every check this server has made, and what it found.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>
            {status.running
              ? "Checking now…"
              : status.account_status === "needs_reauth"
                ? "Paused — sign-in expired"
                : status.next_run_at
                  ? `Next check ${timeAgo(status.next_run_at, loadedAt)}`
                  : "Idle"}
          </CardTitle>
          <CardDescription>
            Every {status.interval_minutes} minutes · {tracked} item
            {tracked === 1 ? "" : "s"} checked · {stored.toLocaleString()}{" "}
            sightings stored
            {status.last_run && (
              <> · last check {dateTime(status.last_run.started_at)}</>
            )}
          </CardDescription>
          {status.account_status === "active" && (
            <CardAction>
              <RefreshButton status={status} now={loadedAt} />
            </CardAction>
          )}
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent checks</CardTitle>
          <CardDescription>
            Newest first. &ldquo;Reports&rdquo; is what Apple returned;
            &ldquo;new&rdquo; is what had not been stored yet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PollRunsTable runs={runs} />
        </CardContent>
      </Card>

      <CoverageNote />
    </main>
  )
}
