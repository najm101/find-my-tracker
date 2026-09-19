import { MapPinnedIcon } from "lucide-react"
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
  FieldError,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { Spinner } from "~/components/ui/spinner"

export function LoginForm({
  error,
  pending,
}: {
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
        <CardDescription>Enter the admin password to continue.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form method="post">
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
      </CardContent>
    </Card>
  )
}
