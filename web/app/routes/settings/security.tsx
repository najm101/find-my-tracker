import { SettingsPage } from "~/components/settings-page"
import { getSecurity } from "~/features/auth/api/auth"
import { PasswordCard } from "~/features/auth/components/password-card"
import { SignInActivity } from "~/features/auth/components/sign-in-activity"
import { TwoFactorCard } from "~/features/auth/components/two-factor-card"

import type { Route } from "./+types/security"

export function meta() {
  return [{ title: "Security · Settings · Find My Tracker" }]
}

export async function clientLoader() {
  return { security: await getSecurity() }
}

export default function SecuritySettings({ loaderData }: Route.ComponentProps) {
  const { security } = loaderData
  return (
    <SettingsPage title="Security" description="Who can reach this dashboard.">
      <TwoFactorCard security={security} />
      <PasswordCard security={security} />
      <SignInActivity security={security} />
    </SettingsPage>
  )
}
