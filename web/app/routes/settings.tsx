import { AppearanceCard } from "~/components/appearance-card"
import { AccountCard } from "~/features/apple-account/components/account-card"
import { BeaconSettings } from "~/features/beacons/components/beacon-settings"
import { getSettings } from "~/features/settings/api/settings"
import { PollingCard } from "~/features/settings/components/polling-card"

import type { Route } from "./+types/settings"
import { useLayoutData } from "./authed-layout"

export function meta() {
  return [{ title: "Settings · Find My Tracker" }]
}

export async function clientLoader() {
  return { settings: await getSettings() }
}

export default function Settings({ loaderData }: Route.ComponentProps) {
  const { settings } = loaderData
  const { account, beacons, status, loadedAt } = useLayoutData()

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 pt-16 pb-16 md:p-8">
      <header>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-muted-foreground">
          How often this server checks Apple, and what it tracks.
        </p>
      </header>
      <PollingCard settings={settings} status={status} now={loadedAt} />
      <BeaconSettings beacons={beacons} />
      <AccountCard account={account} />
      <AppearanceCard />
    </main>
  )
}
