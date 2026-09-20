import { ShieldCheckIcon, ShieldIcon } from "lucide-react"
import { useId, useState } from "react"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "~/components/ui/input-otp"
import { Spinner } from "~/components/ui/spinner"
import { useMutation } from "~/hooks/use-mutation"
import type { Schemas } from "~/lib/api/client"

import {
  confirmTotp,
  disableTotp,
  regenerateRecoveryCodes,
  startTotp,
} from "../api/auth"
import { RecoveryCodes } from "./recovery-codes"

const CODE_LENGTH = 6

type Props = { security: Schemas["SecurityStatus"] }

/**
 * Two-factor authentication is optional: the dashboard works with a password alone. It is
 * worth turning on before opening the server to the internet, where the password is the only
 * thing between a stranger and your location history.
 */
export function TwoFactorCard({ security }: Props) {
  const [setup, setSetup] = useState<Schemas["TotpSetup"] | null>(null)
  const [codes, setCodes] = useState<string[] | null>(null)
  const [disabling, setDisabling] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const { run, pending } = useMutation()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Two-factor authentication
          {security.totp_enabled ? (
            <Badge variant="default">
              <ShieldCheckIcon />
              On
            </Badge>
          ) : (
            <Badge variant="secondary">
              <ShieldIcon />
              Off
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          {security.totp_enabled
            ? "Signing in asks for a code from your authenticator app after the password."
            : "Optional, but worth turning on if this server is reachable from the internet."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {security.totp_enabled ? (
          <>
            <FieldDescription>
              {security.recovery_codes_remaining} unused recovery{" "}
              {security.recovery_codes_remaining === 1 ? "code" : "codes"} left.
            </FieldDescription>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => setDisabling(true)}
              >
                Turn off
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => setRegenerating(true)}
              >
                Replace recovery codes
              </Button>
            </div>
          </>
        ) : (
          <div>
            <Button
              disabled={pending}
              onClick={() => run(async () => setSetup(await startTotp()))}
            >
              {pending && <Spinner />}
              Set up authenticator app
            </Button>
          </div>
        )}
      </CardContent>

      <SetupDialog
        setup={setup}
        onDone={(fresh) => {
          setSetup(null)
          setCodes(fresh)
        }}
        onCancel={() => setSetup(null)}
      />

      <Dialog open={!!codes} onOpenChange={(open) => !open && setCodes(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Your recovery codes</DialogTitle>
            <DialogDescription>
              Keep them somewhere other than the phone with your authenticator
              app.
            </DialogDescription>
          </DialogHeader>
          {codes && <RecoveryCodes codes={codes} />}
          <DialogFooter>
            <Button onClick={() => setCodes(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PasswordPrompt
        open={regenerating}
        onOpenChange={setRegenerating}
        title="New recovery codes"
        description="This replaces every unused code you have now."
        confirmLabel="Generate new codes"
        onConfirm={async (password) => {
          const fresh = await regenerateRecoveryCodes(password)
          setCodes(fresh.codes)
        }}
      />

      <PasswordPrompt
        open={disabling}
        onOpenChange={setDisabling}
        title="Turn off two-factor authentication"
        description="Your password becomes the only thing protecting the dashboard. Your recovery codes are deleted."
        confirmLabel="Turn it off"
        destructive
        onConfirm={disableTotp}
      />
    </Card>
  )
}

/** Scan, then prove the app received it. The secret does nothing until a code confirms it. */
function SetupDialog({
  setup,
  onDone,
  onCancel,
}: {
  setup: Schemas["TotpSetup"] | null
  onDone: (codes: string[]) => void
  onCancel: () => void
}) {
  const [code, setCode] = useState("")
  const { run, pending } = useMutation()

  return (
    <Dialog open={!!setup} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set up your authenticator app</DialogTitle>
          <DialogDescription>
            Scan this with Google Authenticator, the iOS Passwords app,
            1Password, Bitwarden or any other authenticator.
          </DialogDescription>
        </DialogHeader>
        {setup && (
          <div className="flex flex-col gap-4">
            <img
              src={setup.qr_data_uri}
              alt="QR code for your authenticator app"
              className="mx-auto size-48 rounded-md bg-white p-2"
            />
            <Field>
              <FieldLabel htmlFor="totp-secret">
                Or type this key in by hand
              </FieldLabel>
              <Input
                id="totp-secret"
                readOnly
                value={setup.secret}
                className="font-mono text-xs"
                onFocus={(e) => e.currentTarget.select()}
              />
            </Field>
            <Field className="items-center">
              <FieldLabel htmlFor="totp-confirm">
                Then enter the code it shows
              </FieldLabel>
              <InputOTP
                id="totp-confirm"
                maxLength={CODE_LENGTH}
                value={code}
                onChange={setCode}
                containerClassName="justify-center"
              >
                <InputOTPGroup>
                  {Array.from({ length: CODE_LENGTH }, (_, i) => (
                    <InputOTPSlot key={i} index={i} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </Field>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button
            disabled={pending || code.length < CODE_LENGTH}
            onClick={async () => {
              const ok = await run(async () => {
                const fresh = await confirmTotp(code)
                onDone(fresh.codes)
              }, "Two-factor authentication is on.")
              if (!ok) setCode("")
            }}
          >
            {pending && <Spinner />}
            Turn it on
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Changes to the second factor are guarded by re-entering the password. */
export function PasswordPrompt({
  title,
  description,
  confirmLabel,
  destructive,
  onConfirm,
  open,
  onOpenChange: setOpen,
}: {
  title: string
  description: string
  confirmLabel: string
  destructive?: boolean
  onConfirm: (password: string) => Promise<void>
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [password, setPassword] = useState("")
  const fieldId = useId()
  const { run, pending } = useMutation()

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setPassword("")
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor={fieldId}>Your password</FieldLabel>
          <Input
            id={fieldId}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={pending || !password}
            onClick={async () => {
              const ok = await run(() => onConfirm(password))
              if (ok) {
                setOpen(false)
                setPassword("")
              }
            }}
          >
            {pending && <Spinner />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
