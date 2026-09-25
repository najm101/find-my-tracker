import { Outlet } from "react-router"

import { SettingsNav } from "~/components/settings-nav"

/** Settings, a page per section: the sections beside the page, or on a phone, a list first. */
export default function SettingsLayout() {
  return (
    <main className="mx-auto flex w-full max-w-5xl gap-10 p-4 pt-6 pb-16 md:p-8">
      <aside className="hidden w-52 shrink-0 md:block">
        <div className="sticky top-8 flex flex-col gap-3">
          <h2 className="px-2.5 text-lg font-semibold">Settings</h2>
          <SettingsNav />
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </main>
  )
}
