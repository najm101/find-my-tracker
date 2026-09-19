import { RefreshCwIcon } from "lucide-react"

import { Button } from "~/components/ui/button"
import { Spinner } from "~/components/ui/spinner"
import type { Schemas } from "~/lib/api/client"
import { timeAgo } from "~/lib/format"

import { useRefreshNow } from "../hooks/use-refresh-now"

/** "Check now", for the map's control group. */
export function RefreshButton({
  status,
  now,
}: {
  status: Schemas["TrackingStatus"]
  now: number
}) {
  const { refresh, refreshing } = useRefreshNow()
  const busy = refreshing || status.running
  const cooling =
    !!status.refresh_available_at &&
    new Date(status.refresh_available_at).getTime() > now

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={refresh}
      disabled={busy || cooling || status.account_status !== "active"}
      title={
        cooling
          ? `Just checked. Available ${timeAgo(status.refresh_available_at, now)}.`
          : "Check for new locations now"
      }
    >
      {busy ? <Spinner /> : <RefreshCwIcon />}
      {status.running ? "Checking…" : "Refresh"}
    </Button>
  )
}
