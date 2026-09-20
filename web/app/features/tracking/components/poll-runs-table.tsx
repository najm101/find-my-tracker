import { Badge } from "~/components/ui/badge"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "~/components/ui/empty"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table"
import type { Schemas } from "~/lib/api/client"
import { dateTime, duration } from "~/lib/format"

type Run = Schemas["PollRunOut"]

const OUTCOME: Record<
  NonNullable<Run["outcome"]>,
  { label: string; variant: "secondary" | "destructive" }
> = {
  ok: { label: "OK", variant: "secondary" },
  auth_failed: { label: "Sign-in expired", variant: "destructive" },
  apple_error: { label: "Apple error", variant: "destructive" },
  error: { label: "Failed", variant: "destructive" },
}

const TRIGGER: Record<Run["trigger"], string> = {
  schedule: "Scheduled",
  manual: "Manual",
}

/** Every recent check, so a quiet map can be told apart from a broken one. */
export function PollRunsTable({ runs }: { runs: Run[] }) {
  if (runs.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No checks yet</EmptyTitle>
          <EmptyDescription>
            The first check runs shortly after the server starts.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Started</TableHead>
            <TableHead>Trigger</TableHead>
            <TableHead>Took</TableHead>
            <TableHead>Result</TableHead>
            <TableHead className="text-right">Items</TableHead>
            <TableHead className="text-right">Reports</TableHead>
            <TableHead className="text-right">New</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((run) => {
            const outcome = run.outcome ? OUTCOME[run.outcome] : null
            const took = run.finished_at
              ? (new Date(run.finished_at).getTime() -
                  new Date(run.started_at).getTime()) /
                1000
              : null
            return (
              <TableRow key={run.id}>
                <TableCell className="whitespace-nowrap">
                  {dateTime(run.started_at)}
                </TableCell>
                <TableCell>{TRIGGER[run.trigger]}</TableCell>
                <TableCell className="tabular-nums">
                  {took != null ? duration(took) : "—"}
                </TableCell>
                <TableCell>
                  {outcome ? (
                    <Badge variant={outcome.variant}>{outcome.label}</Badge>
                  ) : (
                    <Badge variant="outline">Running</Badge>
                  )}
                  {run.error && (
                    <p className="mt-1 max-w-80 text-xs text-destructive">
                      {run.error}
                    </p>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {run.beacons_polled}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {run.reports_seen.toLocaleString()}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {run.new_locations.toLocaleString()}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
