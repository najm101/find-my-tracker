import { ExternalLinkIcon } from "lucide-react"

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
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "~/components/ui/field"
import { Switch } from "~/components/ui/switch"
import { useMutation } from "~/hooks/use-mutation"
import type { Schemas } from "~/lib/api/client"

import { updateSettings } from "../api/settings"

const DOCS = "/api/docs"

/**
 * The server's API documentation (Swagger UI): off by default, and only ever served to the
 * signed-in admin. One click turns it on and opens it.
 */
export function ApiDocsCard({
  settings,
}: {
  settings: Schemas["AppSettings"]
}) {
  const { run, pending } = useMutation()
  const on = settings.api_docs

  function turnOnAndOpen() {
    // Opened now, while the click still counts as the user's: a tab opened once the request
    // is back would be taken for a pop-up and blocked.
    const tab = window.open("", "_blank")
    void run(
      () => updateSettings({ api_docs: true }),
      "API documentation is on."
    ).then((saved) => {
      if (!tab) return
      if (saved) tab.location.href = DOCS
      else tab.close()
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>API documentation</CardTitle>
        <CardDescription>
          Every endpoint of this server, with a way to try each one. Only you
          can open it, signed in; turned off, it isn&apos;t served at all.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor="api-docs">Serve the documentation</FieldLabel>
            <FieldDescription>At {DOCS}, as Swagger UI.</FieldDescription>
          </FieldContent>
          <Switch
            id="api-docs"
            checked={on}
            disabled={pending}
            onCheckedChange={(checked) =>
              run(
                () => updateSettings({ api_docs: checked }),
                checked
                  ? "API documentation is on."
                  : "API documentation is off."
              )
            }
          />
        </Field>
        <div>
          {on ? (
            <Button asChild variant="outline">
              <a href={DOCS} target="_blank" rel="noreferrer">
                Open the documentation
                <ExternalLinkIcon />
              </a>
            </Button>
          ) : (
            <Button
              variant="outline"
              disabled={pending}
              onClick={turnOnAndOpen}
            >
              Turn on and open
              <ExternalLinkIcon />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
