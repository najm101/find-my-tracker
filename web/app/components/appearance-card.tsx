import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { Field, FieldDescription, FieldLabel } from "~/components/ui/field"

import { ThemeToggle } from "./theme-toggle"

export function AppearanceCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>
          Saved in this browser, not on the server.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Field>
          <FieldLabel asChild>
            <span>Theme</span>
          </FieldLabel>
          <ThemeToggle />
          <FieldDescription>
            The map follows the theme. Its base style is picked with the layers
            button on the map itself.
          </FieldDescription>
        </Field>
      </CardContent>
    </Card>
  )
}
