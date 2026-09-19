import { RefreshCwIcon } from "lucide-react"

import { Button } from "~/components/ui/button"
import { Spinner } from "~/components/ui/spinner"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip"
import type { Schemas } from "~/lib/api/client"
import { dateTime, timeAgo } from "~/lib/format"
import { cn } from "~/lib/utils"

import { useRefreshNow } from "../hooks/use-refresh-now"

const FAILED: Partial<Record<Schemas["PollOutcome"], string>> = {
  auth_failed: "Sign-in expired",
  apple_error: "Apple error",
  error: "Check failed",
}

type Props = {
  status: Schemas["TrackingStatus"]
  now: number
}

/** One line: health dot, last check, and a refresh button. Fits a sidebar footer. */
export function TrackingStatus({ status, now }: Props) {
  const { refresh: onRefresh, refreshing } = useRefreshNow()
  const last = status.last_run
  const failed = last?.outcome ? FAILED[last.outcome] : undefined
  const cooling =
    !!status.refresh_available_at &&
    new Date(status.refresh_available_at).getTime() > now
  const busy = refreshing || status.running

  const summary = status.running
    ? "Checking now…"
    : last
      ? `${failed ?? "Checked"} ${timeAgo(last.started_at, now)}`
      : "No checks yet"

  return (
    <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs">
      <span
        className={cn(
          "size-2 shrink-0 rounded-full",
          status.running
            ? "animate-pulse bg-primary"
            : failed
              ? "bg-destructive"
              : "bg-emerald-500"
        )}
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="min-w-0 flex-1 truncate">{summary}</span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-64">
          {last ? (
            <>
              Last check {dateTime(last.started_at)}: {last.reports_seen}{" "}
              reports, {last.new_locations} new.
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
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={onRefresh}
        disabled={busy || cooling}
        title={
          cooling
            ? `Refresh available ${timeAgo(status.refresh_available_at, now)}`
            : "Refresh now"
        }
      >
        {busy ? <Spinner /> : <RefreshCwIcon />}
        <span className="sr-only">Refresh now</span>
      </Button>
    </div>
  )
}
