import { SettingsPage } from "~/components/settings-page"
import { BeaconSettings } from "~/features/beacons/components/beacon-settings"

import { useLayoutData } from "../authed-layout"

export function meta() {
  return [{ title: "Items · Settings · Find My Tracker" }]
}

export default function ItemsSettings() {
  const { beacons } = useLayoutData()
  return (
    <SettingsPage title="Items">
      <BeaconSettings beacons={beacons} />
    </SettingsPage>
  )
}
