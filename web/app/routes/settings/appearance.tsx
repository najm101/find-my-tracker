import { AppearanceCard } from "~/components/appearance-card"
import { SettingsPage } from "~/components/settings-page"

export function meta() {
  return [{ title: "Appearance · Settings · Find My Tracker" }]
}

export default function AppearanceSettings() {
  return (
    <SettingsPage title="Appearance">
      <AppearanceCard />
    </SettingsPage>
  )
}
