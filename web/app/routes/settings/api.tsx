import { SettingsPage } from "~/components/settings-page"
import { getSettings } from "~/features/settings/api/settings"
import { ApiDocsCard } from "~/features/settings/components/api-docs-card"

import type { Route } from "./+types/api"

export function meta() {
  return [{ title: "API · Settings · Find My Tracker" }]
}

export async function clientLoader() {
  return { settings: await getSettings() }
}

export default function ApiSettings({ loaderData }: Route.ComponentProps) {
  return (
    <SettingsPage title="API">
      <ApiDocsCard settings={loaderData.settings} />
    </SettingsPage>
  )
}
