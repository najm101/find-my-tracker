import type { LucideIcon } from "lucide-react"
import { NavLink, useSearchParams } from "react-router"

import { cn } from "~/lib/utils"

export type TabItem = {
  to: string
  label: string
  icon: LucideIcon
  end: boolean
  /** Carry the map's view state (range, hidden items) across tabs that show the map. */
  keepView: boolean
}

/**
 * Phone navigation. The sidebar becomes a full-screen sheet on a phone, which buries the map
 * behind a menu on the one screen that matters most; a bottom bar keeps every destination one
 * thumb-reach away and never covers the map.
 *
 * Four destinations, under the five-item limit past which labels stop being readable. Each
 * target is 56px tall, comfortably over the 44px minimum, and the bar pads itself out of the
 * home indicator's way.
 */
export function MobileTabBar({ items }: { items: TabItem[] }) {
  const [params] = useSearchParams()

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden"
    >
      <ul className="grid grid-cols-4">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={{
                pathname: item.to,
                search: item.keepView ? params.toString() : "",
              }}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "relative flex h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground active:text-foreground"
                )
              }
            >
              {({ isActive }) => (
                <>
                  {/* The active tab is marked by weight and a bar, not colour alone. */}
                  <item.icon
                    className={cn("size-5", isActive && "stroke-[2.5]")}
                    aria-hidden
                  />
                  <span>{item.label}</span>
                  <span
                    className={cn(
                      "absolute top-0 h-0.5 w-10 rounded-full bg-primary transition-opacity",
                      isActive ? "opacity-100" : "opacity-0"
                    )}
                  />
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
