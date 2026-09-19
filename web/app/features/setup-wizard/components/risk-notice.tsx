import { TriangleAlertIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"

export function RiskNotice({
  onAccept,
  deviceSerial,
}: {
  onAccept: () => void
  deviceSerial?: string | null
}) {
  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <TriangleAlertIcon />
        <AlertTitle>Read this before signing in</AlertTitle>
        <AlertDescription>
          <ul className="list-disc space-y-1.5 pl-4">
            <li>
              This uses Apple&apos;s private Find My APIs.{" "}
              <strong>Apple may ban the account</strong>, especially if it is
              polled too often. Keep the interval at 30 minutes or more.
            </li>
            <li>
              Apple can break this at any time; updating usually fixes it.
            </li>
            <li>
              The keys stored here can locate your beacons. They are encrypted
              with your SECRET_KEY. Keep the server private.
            </li>
            <li>
              Only beacons registered to your own Apple account can be added.
            </li>
            <li>
              Signing in adds <strong>one</strong> device to your Apple
              account&apos;s device list: a MacBook Pro
              {deviceSerial && (
                <>
                  {" "}
                  with serial <code className="font-mono">{deviceSerial}</code>
                </>
              )}
              . That&apos;s this server. It stays the same entry even if you
              sign out and back in; removing it signs this server out.
            </li>
          </ul>
        </AlertDescription>
      </Alert>
      <p className="text-sm text-muted-foreground">
        You&apos;ll need your Apple ID password, a verification code, and the
        screen-lock passcode of one of your Apple devices.
      </p>
      <Button onClick={onAccept} className="self-end">
        I understand, continue
      </Button>
    </div>
  )
}
