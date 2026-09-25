import { SettingsPage } from "~/components/settings-page"
import { getSettings } from "~/features/settings/api/settings"
import { PollingCard } from "~/features/settings/components/polling-card"

import { useLayoutData } from "../authed-layout"
import type { Route } from "./+types/tracking"

export function meta() {
  return [{ title: "Tracking · Settings · Find My Tracker" }]
}

export async function clientLoader() {
  return { settings: await getSettings() }
}

export default function TrackingSettings({ loaderData }: Route.ComponentProps) {
  const { status, loadedAt } = useLayoutData()
  return (
    <SettingsPage title="Tracking">
      <PollingCard
        settings={loaderData.settings}
        status={status}
        now={loadedAt}
      />
    </SettingsPage>
  )
}
