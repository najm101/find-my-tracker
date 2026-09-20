import { InfoIcon } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"

/**
 * Why a healthy install still shows quiet stretches. The single most common "is it broken?"
 * question, so it sits next to the check log where people go to find out.
 */
export function CoverageNote() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <InfoIcon className="size-4 text-muted-foreground" />
          Gaps in the history are normal
        </CardTitle>
        <CardDescription>
          Successful checks that find nothing new are not a fault.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
        <p>
          Apple&apos;s network only reports an item while it is{" "}
          <em>away from your own Apple devices</em>. An AirTag next to your
          iPhone is connected to it rather than separated, so it stops
          broadcasting altogether and no passing iPhone can report it.
        </p>
        <p>
          So you get good history for trips and for things you have left
          somewhere, and little or none for the hours an item spends with you.
          No server can close that gap — it needs a device physically near the
          item, which is how Apple&apos;s own Find My app does it.
        </p>
        <p>
          A check that reports zero new locations while an item is in your
          pocket is the system working as designed.
        </p>
      </CardContent>
    </Card>
  )
}
