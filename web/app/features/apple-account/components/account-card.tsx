import { CircleAlertIcon, PlusIcon } from "lucide-react"
import { useState } from "react"
import { Link, useNavigate } from "react-router"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { Checkbox } from "~/components/ui/checkbox"
import { Label } from "~/components/ui/label"
import { useMutation } from "~/hooks/use-mutation"
import type { Schemas } from "~/lib/api/client"
import { dateTime } from "~/lib/format"

import { signOutOfApple } from "../api/account"

type Account = Schemas["AccountOut"]

const STATUS: Record<
  Account["status"],
  { label: string; variant: "default" | "secondary" | "destructive" }
> = {
  none: { label: "Not connected", variant: "secondary" },
  active: { label: "Connected", variant: "default" },
  needs_reauth: { label: "Sign-in expired", variant: "destructive" },
}

export function AccountCard({ account }: { account: Account }) {
  const { run, pending } = useMutation()
  const navigate = useNavigate()
  const [purge, setPurge] = useState(false)
  const status = STATUS[account.status]
  const connected = account.status !== "none"

  return (
    <Card>
      <CardHeader>
        <CardTitle>Apple account</CardTitle>
        <CardDescription>
          {account.apple_id ?? "No Apple account is connected yet."}
        </CardDescription>
        <CardAction>
          <Badge variant={status.variant}>{status.label}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {account.status === "needs_reauth" && (
          <p className="flex items-start gap-2 text-destructive">
            <CircleAlertIcon className="mt-0.5 size-4 shrink-0" />
            <span>
              {account.last_error ?? "Apple ended the saved session."} Checking
              is paused until you sign in again.
            </span>
          </p>
        )}
        {connected && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-muted-foreground">
            {account.display_name && (
              <>
                <dt>Name</dt>
                <dd className="text-foreground">{account.display_name}</dd>
              </>
            )}
            <dt>Connected</dt>
            <dd className="text-foreground">
              {dateTime(account.connected_at)}
            </dd>
            {account.device_serial && (
              <>
                <dt>Appears as</dt>
                <dd className="text-foreground">
                  A Mac, serial {account.device_serial}
                </dd>
              </>
            )}
          </dl>
        )}
        {connected && account.device_serial && (
          <p className="text-muted-foreground">
            Signing in needs a device in your account. This server registers
            itself as one so it doesn&apos;t add a new Mac every time.
          </p>
        )}
      </CardContent>
      <CardFooter className="flex-wrap gap-2">
        {account.status === "needs_reauth" ? (
          <Button asChild>
            <Link to="/setup">Sign in again</Link>
          </Button>
        ) : (
          <Button asChild variant="outline">
            <Link to="/setup">
              <PlusIcon />
              {connected ? "Add items" : "Connect Apple account"}
            </Link>
          </Button>
        )}
        {connected && (
          <>
            <Button asChild variant="ghost">
              <Link to="/setup?mode=connect">Use a different Apple ID</Link>
            </Button>
            <AlertDialog onOpenChange={() => setPurge(false)}>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" className="ms-auto text-destructive">
                  Sign out
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Sign out of Apple?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The saved session and the keys that locate your items are
                    deleted, and checking stops. Your items and their history
                    stay, so you can sign in again and carry on.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <Label className="flex items-start gap-3 rounded-md border p-3 text-sm font-normal">
                  <Checkbox
                    checked={purge}
                    onCheckedChange={(v) => setPurge(v === true)}
                  />
                  <span>
                    Also delete every item and its whole history.
                    <span className="block text-muted-foreground">
                      This cannot be undone.
                    </span>
                  </span>
                </Label>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={pending}
                    onClick={async () => {
                      const ok = await run(
                        () => signOutOfApple({ purge }),
                        purge ? "Signed out and wiped." : "Signed out."
                      )
                      if (ok) await navigate("/setup")
                    }}
                  >
                    {purge ? "Sign out and delete everything" : "Sign out"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </CardFooter>
    </Card>
  )
}
