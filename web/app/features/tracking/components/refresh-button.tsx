import { RefreshCwIcon } from "lucide-react"

import { Button } from "~/components/ui/button"
import { Spinner } from "~/components/ui/spinner"
import type { Schemas } from "~/lib/api/client"
import { timeAgo } from "~/lib/format"

import { useRefreshNow } from "../hooks/use-refresh-now"

/** "Check now": in the map's control group, or as an icon (`compact`) beside the status. */
export function RefreshButton({
  status,
  now,
  compact = false,
}: {
  status: Schemas["TrackingStatus"]
  now: number
  compact?: boolean
}) {
  const { refresh, refreshing } = useRefreshNow()
  const busy = refreshing || status.running
  const cooling =
    !!status.refresh_available_at &&
    new Date(status.refresh_available_at).getTime() > now

  return (
    <Button
      variant={compact ? "ghost" : "outline"}
      size={compact ? "icon-sm" : "sm"}
      aria-label={compact ? "Check for new locations now" : undefined}
      onClick={refresh}
      disabled={busy || cooling || status.account_status !== "active"}
      title={
        cooling
          ? `Just checked. Available ${timeAgo(status.refresh_available_at, now)}.`
          : "Check for new locations now"
      }
    >
      {busy ? <Spinner /> : <RefreshCwIcon />}
      {!compact && (status.running ? "Checking…" : "Refresh")}
    </Button>
  )
}
