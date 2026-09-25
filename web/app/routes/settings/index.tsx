import { LogOutIcon } from "lucide-react"
import { redirect, useNavigate } from "react-router"

import { SettingsList } from "~/components/settings-nav"
import { Button } from "~/components/ui/button"
import { logout } from "~/features/auth/api/auth"

export function meta() {
  return [{ title: "Settings · Find My Tracker" }]
}

/** On a wider screen the sections are listed beside the page: open the first one. */
export async function clientLoader() {
  if (window.matchMedia("(min-width: 768px)").matches)
    throw redirect("/settings/tracking")
  return null
}

export default function SettingsIndex() {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-muted-foreground">
          How often this server checks Apple, what it tracks, and who can reach
          it.
        </p>
      </header>
      <SettingsList />
      {/* On a phone there is no sidebar to log out from. */}
      <Button
        variant="outline"
        onClick={async () => {
          await logout()
          await navigate("/login")
        }}
      >
        <LogOutIcon />
        Log out
      </Button>
    </div>
  )
}
