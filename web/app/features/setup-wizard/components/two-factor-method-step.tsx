import { MessageSquareIcon, SmartphoneIcon } from "lucide-react"
import { useState } from "react"

import { Button } from "~/components/ui/button"
import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "~/components/ui/field"
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group"
import { Spinner } from "~/components/ui/spinner"
import type { Schemas } from "~/lib/api/client"

type Props = {
  busy: boolean
  methods: Schemas["MethodOut"][]
  onSubmit: (methodId: number) => void
}

export function TwoFactorMethodStep({ busy, methods, onSubmit }: Props) {
  const [selected, setSelected] = useState(String(methods[0]?.id ?? ""))

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(Number(selected))
      }}
    >
      <FieldGroup>
        <FieldSet>
          <FieldLegend variant="label">
            Where should Apple send the code?
          </FieldLegend>
          <RadioGroup value={selected} onValueChange={setSelected}>
            {methods.map((m) => {
              const Icon = m.kind === "sms" ? MessageSquareIcon : SmartphoneIcon
              return (
                <FieldLabel key={m.id} htmlFor={`method-${m.id}`}>
                  <Field orientation="horizontal">
                    <Icon className="size-4 text-muted-foreground" />
                    <FieldContent>
                      <FieldTitle>{m.label}</FieldTitle>
                    </FieldContent>
                    <RadioGroupItem
                      value={String(m.id)}
                      id={`method-${m.id}`}
                    />
                  </Field>
                </FieldLabel>
              )
            })}
          </RadioGroup>
        </FieldSet>
        <Button type="submit" disabled={busy || !selected} className="self-end">
          {busy && <Spinner />}
          Send code
        </Button>
      </FieldGroup>
    </form>
  )
}
