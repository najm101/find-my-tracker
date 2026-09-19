import { useState } from "react"

import { Button } from "~/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { Spinner } from "~/components/ui/spinner"

type Props = {
  busy: boolean
  defaultAppleId?: string | null
  onSubmit: (appleId: string, password: string) => void
}

export function CredentialsStep({ busy, defaultAppleId, onSubmit }: Props) {
  const [appleId, setAppleId] = useState(defaultAppleId ?? "")
  const [password, setPassword] = useState("")

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(appleId, password)
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="apple-id">Apple ID</FieldLabel>
          <Input
            id="apple-id"
            type="email"
            autoComplete="username"
            placeholder="you@icloud.com"
            value={appleId}
            onChange={(e) => setAppleId(e.target.value)}
            required
            autoFocus
          />
          <FieldDescription>
            The account your AirTags and devices are registered to.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="apple-password">Password</FieldLabel>
          <Input
            id="apple-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <FieldDescription>
            Sent to Apple only. Never stored as plain text.
          </FieldDescription>
        </Field>
        <Button type="submit" disabled={busy} className="self-end">
          {busy && <Spinner />}
          Sign in to Apple
        </Button>
      </FieldGroup>
    </form>
  )
}
