import { MapPanel } from "~/components/map-panel"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip"
import type { Schemas } from "~/lib/api/client"
import { dateTime, timeAgo } from "~/lib/format"
import { describeInterval } from "~/lib/poll-intervals"
import { cn } from "~/lib/utils"

const FAILED: Partial<Record<Schemas["PollOutcome"], string>> = {
  auth_failed: "Sign-in expired",
  apple_error: "Apple error",
  error: "Check failed",
}

type Props = {
  status: Schemas["TrackingStatus"]
  now: number
  /** Plain text in a line (the sidebar), not a pill floating on the map. */
  inline?: boolean
}

/** The status of checks: health dot and last check, with details on hover. */
export function TrackingStatus({ status, now, inline = false }: Props) {
  const last = status.last_run
  const failed = last?.outcome ? FAILED[last.outcome] : undefined
  const summary = status.running
    ? "Checking now…"
    : last
      ? `${failed ?? "Checked"} ${timeAgo(last.started_at, now)}`
      : "No checks yet"

  const Surface = inline ? "span" : MapPanel
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Surface
          className={cn(
            "gap-2 text-xs",
            inline
              ? "flex min-w-0 items-center text-muted-foreground"
              : "px-2.5 py-1.5"
          )}
        >
          <span
            className={cn(
              "size-2 shrink-0 rounded-full",
              status.running
                ? "animate-pulse bg-primary"
                : failed
                  ? "bg-destructive"
                  : "bg-primary"
            )}
          />
          <span className="truncate whitespace-nowrap">{summary}</span>
        </Surface>
      </TooltipTrigger>
      <TooltipContent side="top" align="start" className="max-w-64">
        {last ? (
          <>
            Last check {dateTime(last.started_at)}: {last.reports_seen} reports,{" "}
            {last.new_locations} new.
            {last.error && <> {last.error}</>}
          </>
        ) : (
          "Waiting for the first check."
        )}
        <br />
        Checks {describeInterval(status.interval_minutes)}
        {status.next_run_at && !status.running && (
          <>, next {timeAgo(status.next_run_at, now)}</>
        )}
        .
      </TooltipContent>
    </Tooltip>
  )
}
