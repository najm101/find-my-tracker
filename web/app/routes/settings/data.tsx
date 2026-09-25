import { SettingsPage } from "~/components/settings-page"
import { exportHref } from "~/features/history/api/locations"
import { getRetention } from "~/features/retention/api/retention"
import { RetentionCard } from "~/features/retention/components/retention-card"

import { useLayoutData } from "../authed-layout"
import type { Route } from "./+types/data"

export function meta() {
  return [{ title: "Data · Settings · Find My Tracker" }]
}

export async function clientLoader() {
  return { retention: await getRetention() }
}

export default function DataSettings({ loaderData }: Route.ComponentProps) {
  const { loadedAt } = useLayoutData()
  return (
    <SettingsPage title="Data">
      <RetentionCard
        retention={loaderData.retention}
        now={loadedAt}
        exportHref={(format, before) =>
          exportHref({ from: new Date(0), to: new Date(before) }, format)
        }
      />
    </SettingsPage>
  )
}
