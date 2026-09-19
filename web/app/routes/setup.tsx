import { useSearchParams } from "react-router"

import { getAccount } from "~/features/apple-account/api/account"
import { getWizard } from "~/features/setup-wizard/api/wizard"
import { SetupWizard } from "~/features/setup-wizard/components/setup-wizard"

import type { Route } from "./+types/setup"

export function meta() {
  return [{ title: "Connect Apple account · Find My Tracker" }]
}

export async function clientLoader() {
  const [view, account] = await Promise.all([getWizard(), getAccount()])
  return { view, account }
}

export default function Setup({ loaderData }: Route.ComponentProps) {
  const { view, account } = loaderData
  const [params] = useSearchParams()
  // `?mode=connect` forces a fresh sign-in (e.g. to use a different Apple ID).
  const autoAdd =
    account.status === "active" && params.get("mode") !== "connect"
  return (
    <main className="flex min-h-svh flex-1 items-start justify-center bg-muted/40 p-4 pt-16 sm:items-center md:pt-4">
      <SetupWizard
        initialView={view}
        reauth={account.status === "needs_reauth"}
        appleId={account.apple_id}
        autoAdd={autoAdd}
        deviceSerial={account.device_serial}
      />
    </main>
  )
}
