import { REGEXP_ONLY_DIGITS } from "input-otp"
import { useState } from "react"

import { Button } from "~/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "~/components/ui/input-otp"
import { Spinner } from "~/components/ui/spinner"

type Props = {
  busy: boolean
  onSubmit: (code: string) => void
  onResend: () => void
}

export function TwoFactorCodeStep({ busy, onSubmit, onResend }: Props) {
  const [code, setCode] = useState("")

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(code)
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="code">Verification code</FieldLabel>
          <InputOTP
            id="code"
            maxLength={6}
            pattern={REGEXP_ONLY_DIGITS}
            value={code}
            onChange={setCode}
            onComplete={onSubmit}
            autoFocus
            disabled={busy}
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
            </InputOTPGroup>
            <InputOTPSeparator />
            <InputOTPGroup>
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
          <FieldDescription>
            Enter the 6-digit code Apple sent you.
          </FieldDescription>
        </Field>
        <div className="flex justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onResend}
            disabled={busy}
          >
            Send a new code
          </Button>
          <Button type="submit" disabled={busy || code.length !== 6}>
            {busy && <Spinner />}
            Verify
          </Button>
        </div>
      </FieldGroup>
    </form>
  )
}
