import { SettingsPage } from "~/components/settings-page"
import { AccountCard } from "~/features/apple-account/components/account-card"

import { useLayoutData } from "../authed-layout"

export function meta() {
  return [{ title: "Apple account · Settings · Find My Tracker" }]
}

export default function AccountSettings() {
  const { account } = useLayoutData()
  return (
    <SettingsPage title="Apple account">
      <AccountCard account={account} />
    </SettingsPage>
  )
}
