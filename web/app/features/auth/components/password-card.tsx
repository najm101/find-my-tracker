import { useState } from "react"
import { useNavigate } from "react-router"

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
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { Spinner } from "~/components/ui/spinner"
import { useMutation } from "~/hooks/use-mutation"
import type { Schemas } from "~/lib/api/client"
import { dateTime } from "~/lib/format"

import { changePassword, revokeSessions } from "../api/auth"

/** Matches the server's floor; the server rejects anything shorter anyway. */
const MIN_LENGTH = 12

export function PasswordCard({
  security,
}: {
  security: Schemas["SecurityStatus"]
}) {
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const navigate = useNavigate()
  const { run, pending } = useMutation()

  const tooShort = next.length > 0 && next.length < MIN_LENGTH

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>
          Last changed {dateTime(security.password_changed_at)}.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="current-password">Current password</FieldLabel>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className="sm:w-80"
            />
          </Field>
          <Field data-invalid={tooShort}>
            <FieldLabel htmlFor="new-password">New password</FieldLabel>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              aria-invalid={tooShort}
              className="sm:w-80"
            />
            <FieldDescription>
              At least {MIN_LENGTH} characters. Changing it signs every other
              browser out; this one stays signed in.
            </FieldDescription>
          </Field>
          <div>
            <Button
              disabled={pending || !current || next.length < MIN_LENGTH}
              onClick={async () => {
                const ok = await run(
                  () => changePassword(current, next),
                  "Password changed."
                )
                if (ok) {
                  setCurrent("")
                  setNext("")
                }
              }}
            >
              {pending && <Spinner />}
              Change password
            </Button>
          </div>
        </FieldGroup>

        <Field className="border-t pt-6">
          <FieldLabel>Signed-in browsers</FieldLabel>
          <FieldDescription>
            Sign out everywhere if you think a session cookie was copied, or you
            left yourself signed in on a device you no longer have. You will
            need to log in again here.
          </FieldDescription>
          <div>
            <Button
              variant="outline"
              disabled={pending}
              onClick={async () => {
                const ok = await run(revokeSessions)
                if (ok) await navigate("/login")
              }}
            >
              Sign out everywhere
            </Button>
          </div>
        </Field>
      </CardContent>
    </Card>
  )
}
