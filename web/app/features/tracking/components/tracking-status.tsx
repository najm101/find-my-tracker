import { MapPanel } from "~/components/map-panel"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip"
import type { Schemas } from "~/lib/api/client"
import { dateTime, timeAgo } from "~/lib/format"
import { cn } from "~/lib/utils"

const FAILED: Partial<Record<Schemas["PollOutcome"], string>> = {
  auth_failed: "Sign-in expired",
  apple_error: "Apple error",
  error: "Check failed",
}

type Props = {
  status: Schemas["TrackingStatus"]
  now: number
}

/** The map's status pill: health dot and last check, with details on hover. */
export function TrackingStatus({ status, now }: Props) {
  const last = status.last_run
  const failed = last?.outcome ? FAILED[last.outcome] : undefined
  const summary = status.running
    ? "Checking now…"
    : last
      ? `${failed ?? "Checked"} ${timeAgo(last.started_at, now)}`
      : "No checks yet"

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <MapPanel className="gap-2 px-2.5 py-1.5 text-xs">
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
          <span className="whitespace-nowrap">{summary}</span>
        </MapPanel>
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
        Checks every {status.interval_minutes} min
        {status.next_run_at && !status.running && (
          <>, next {timeAgo(status.next_run_at, now)}</>
        )}
        .
      </TooltipContent>
    </Tooltip>
  )
}
