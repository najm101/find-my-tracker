import { CircleCheckIcon } from "lucide-react"
import { Link } from "react-router"

import { Button } from "~/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"

export function DoneStep({
  count,
  adding,
  deviceSerial,
}: {
  count: number
  adding: boolean
  deviceSerial?: string | null
}) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CircleCheckIcon />
        </EmptyMedia>
        <EmptyTitle>{adding ? "Added" : "You're set up"}</EmptyTitle>
        <EmptyDescription>
          {adding ? "Now also tracking" : "Tracking"} {count} item
          {count === 1 ? "" : "s"}. The first check is running now; it can take
          a few minutes for items that haven&apos;t been located in a while.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {deviceSerial && !adding && (
          <p className="text-xs text-muted-foreground">
            In your Apple account&apos;s device list this server is a MacBook
            Pro with serial <code className="font-mono">{deviceSerial}</code>.
            Leave it there.
          </p>
        )}
        <Button asChild>
          <Link to="/">Go to dashboard</Link>
        </Button>
      </EmptyContent>
    </Empty>
  )
}
