import { AppearanceCard } from "~/components/appearance-card"
import { AccountCard } from "~/features/apple-account/components/account-card"
import { LogOutIcon } from "lucide-react"
import { useNavigate } from "react-router"

import { Button } from "~/components/ui/button"
import { getSecurity, logout } from "~/features/auth/api/auth"
import { PasswordCard } from "~/features/auth/components/password-card"
import { SignInActivity } from "~/features/auth/components/sign-in-activity"
import { TwoFactorCard } from "~/features/auth/components/two-factor-card"
import { BeaconSettings } from "~/features/beacons/components/beacon-settings"
import { getRouting } from "~/features/routing/api/routing"
import { PredictedRoutesCard } from "~/features/routing/components/predicted-routes-card"
import { getSettings } from "~/features/settings/api/settings"
import { PollingCard } from "~/features/settings/components/polling-card"

import type { Route } from "./+types/settings"
import { useLayoutData } from "./authed-layout"

export function meta() {
  return [{ title: "Settings · Find My Tracker" }]
}

export async function clientLoader() {
  const [settings, security, routing] = await Promise.all([
    getSettings(),
    getSecurity(),
    getRouting(),
  ])
  return { settings, security, routing }
}

export default function Settings({ loaderData }: Route.ComponentProps) {
  const { settings, security, routing } = loaderData
  const { account, beacons, status, loadedAt } = useLayoutData()
  const navigate = useNavigate()

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 pt-8 pb-16 md:p-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="text-muted-foreground">
            How often this server checks Apple, what it tracks, and who can
            reach it.
          </p>
        </div>
        {/* On a phone there is no sidebar to log out from. */}
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 md:hidden"
          onClick={async () => {
            await logout()
            await navigate("/login")
          }}
        >
          <LogOutIcon />
          Log out
        </Button>
      </header>
      <PollingCard settings={settings} status={status} now={loadedAt} />
      <BeaconSettings beacons={beacons} />
      <PredictedRoutesCard routing={routing} now={loadedAt} />
      <AccountCard account={account} />

      <section className="flex flex-col gap-6">
        <h2 className="text-lg font-semibold">Security</h2>
        <TwoFactorCard security={security} />
        <PasswordCard security={security} />
        <SignInActivity security={security} />
      </section>

      <AppearanceCard />
    </main>
  )
}
