import { MapPinnedIcon } from "lucide-react"
import { useState } from "react"
import { Form } from "react-router"

import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "~/components/ui/input-otp"
import { Spinner } from "~/components/ui/spinner"

export type LoginStage = "password" | "mfa"

const CODE_LENGTH = 6

export function LoginForm({
  stage,
  error,
  pending,
}: {
  stage: LoginStage
  error?: string
  pending: boolean
}) {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <MapPinnedIcon className="size-5" />
        </div>
        <CardTitle className="text-xl">Find My Tracker</CardTitle>
        <CardDescription>
          {stage === "mfa"
            ? "Enter the code from your authenticator app."
            : "Enter the admin password to continue."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {stage === "mfa" ? (
          <CodeStep error={error} pending={pending} />
        ) : (
          <PasswordStep error={error} pending={pending} />
        )}
      </CardContent>
    </Card>
  )
}

function PasswordStep({
  error,
  pending,
}: {
  error?: string
  pending: boolean
}) {
  return (
    <Form method="post">
      <input type="hidden" name="intent" value="password" />
      <FieldGroup>
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            required
            aria-invalid={!!error}
          />
          {error && <FieldError>{error}</FieldError>}
        </Field>
        <Button type="submit" disabled={pending}>
          {pending && <Spinner />}
          Log in
        </Button>
      </FieldGroup>
    </Form>
  )
}

/**
 * Six digits by default, with a way out for the day the phone is lost. The recovery code is a
 * plain text field: it is far longer than an OTP input can hold.
 */
function CodeStep({ error, pending }: { error?: string; pending: boolean }) {
  const [recovery, setRecovery] = useState(false)
  const [code, setCode] = useState("")

  return (
    <Form method="post">
      <input type="hidden" name="intent" value="mfa" />
      <FieldGroup>
        {recovery ? (
          <Field data-invalid={!!error}>
            <FieldLabel htmlFor="recovery-code">Recovery code</FieldLabel>
            <Input
              id="recovery-code"
              name="code"
              autoComplete="one-time-code"
              autoFocus
              required
              placeholder="abcde-fghij-klmnp"
              aria-invalid={!!error}
            />
            <FieldDescription>Each recovery code works once.</FieldDescription>
            {error && <FieldError>{error}</FieldError>}
          </Field>
        ) : (
          <Field data-invalid={!!error} className="items-center">
            <FieldLabel htmlFor="mfa-code" className="sr-only">
              Authenticator code
            </FieldLabel>
            <InputOTP
              id="mfa-code"
              name="code"
              maxLength={CODE_LENGTH}
              value={code}
              onChange={setCode}
              autoFocus
              containerClassName="justify-center"
            >
              <InputOTPGroup>
                {Array.from({ length: CODE_LENGTH }, (_, i) => (
                  <InputOTPSlot key={i} index={i} />
                ))}
              </InputOTPGroup>
            </InputOTP>
            {error && <FieldError>{error}</FieldError>}
          </Field>
        )}
        <Button
          type="submit"
          disabled={pending || (!recovery && code.length < CODE_LENGTH)}
        >
          {pending && <Spinner />}
          Continue
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setRecovery(!recovery)
            setCode("")
          }}
        >
          {recovery
            ? "Use your authenticator app"
            : "Use a recovery code instead"}
        </Button>
      </FieldGroup>
    </Form>
  )
}
