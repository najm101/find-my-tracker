import { SettingsPage } from "~/components/settings-page"
import { getRouting } from "~/features/routing/api/routing"
import { PredictedRoutesCard } from "~/features/routing/components/predicted-routes-card"

import { useLayoutData } from "../authed-layout"
import type { Route } from "./+types/predicted-routes"

export function meta() {
  return [{ title: "Predicted routes · Settings · Find My Tracker" }]
}

export async function clientLoader() {
  return { routing: await getRouting() }
}

export default function PredictedRoutesSettings({
  loaderData,
}: Route.ComponentProps) {
  const { loadedAt } = useLayoutData()
  return (
    <SettingsPage title="Predicted routes">
      <PredictedRoutesCard routing={loaderData.routing} now={loadedAt} />
    </SettingsPage>
  )
}
