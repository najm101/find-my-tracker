import {
  ChevronsUpDownIcon,
  LogOutIcon,
  MapPinnedIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  SettingsIcon,
  ShieldIcon,
} from "lucide-react"
import type { ReactNode } from "react"
import { Link, NavLink, useLocation, useSearchParams } from "react-router"

import type { TabItem } from "~/components/mobile-tab-bar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "~/components/ui/sidebar"

const SHORTCUT = /Mac|iPhone|iPad/.test(globalThis.navigator?.userAgent ?? "")
  ? "⌘B"
  : "Ctrl+B"

/**
 * The desktop sidebar: where you are, how checking is going, and the tracked items. It folds
 * down to a rail of icons (the button at the bottom, or ⌘/Ctrl+B) to give the map the room, and
 * remembers that per browser.
 */
export function AppSidebar({
  nav,
  status,
  items,
  onLogout,
}: {
  nav: TabItem[]
  /** How checking is going, under the name; hidden while folded. */
  status?: ReactNode
  /** The tracked items. */
  items: ReactNode
  onLogout: () => void
}) {
  const location = useLocation()
  const [params] = useSearchParams()

  return (
    <Sidebar collapsible="icon" className="hidden md:flex">
      <SidebarHeader className="gap-1.5">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Find My Tracker">
              <Link to="/" className="font-medium">
                <MapPinnedIcon />
                <span>Find My Tracker</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        {status && (
          <div className="flex min-w-0 items-center justify-between gap-1 pl-2 group-data-[collapsible=icon]:hidden">
            {status}
          </div>
        )}
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {nav.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    asChild
                    tooltip={item.label}
                    isActive={
                      item.end
                        ? location.pathname === item.to
                        : location.pathname.startsWith(item.to)
                    }
                  >
                    <NavLink
                      to={{
                        pathname: item.to,
                        search: item.keepView ? params.toString() : "",
                      }}
                      end={item.end}
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {items}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <AccountMenu onLogout={onLogout} />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <FoldButton />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

/** One admin, so no name: what's reachable from here, and logging out. */
function AccountMenu({ onLogout }: { onLogout: () => void }) {
  const { isMobile } = useSidebar()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="lg"
          tooltip="Account"
          className="data-[state=open]:bg-sidebar-accent"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
            A
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium">Admin</span>
            <span className="truncate text-xs text-muted-foreground">
              Signed in
            </span>
          </span>
          <ChevronsUpDownIcon className="ml-auto" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={isMobile ? "top" : "right"}
        align="end"
        className="w-56"
      >
        <DropdownMenuLabel>Admin</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link to="/settings">
            <SettingsIcon />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/settings/security">
            <ShieldIcon />
            Password and two-factor
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onLogout}>
          <LogOutIcon />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function FoldButton() {
  const { state, toggleSidebar } = useSidebar()
  const folded = state === "collapsed"
  return (
    <SidebarMenuButton
      onClick={toggleSidebar}
      tooltip={`Expand (${SHORTCUT})`}
      className="text-muted-foreground"
    >
      {folded ? <PanelLeftOpenIcon /> : <PanelLeftCloseIcon />}
      <span>Collapse</span>
      <kbd className="ml-auto text-xs">{SHORTCUT}</kbd>
    </SidebarMenuButton>
  )
}

/**
 * Only while there's no full sidebar showing how checking is going: on a phone, or folded. For
 * the status and refresh button floating on the map.
 */
export function WithoutFullSidebar({ children }: { children: ReactNode }) {
  const { isMobile, state } = useSidebar()
  return isMobile || state === "collapsed" ? children : null
}

/** The sidebar's saved state, read before first paint so a folded one doesn't flash open. */
export function sidebarWasOpen(): boolean {
  if (typeof document === "undefined") return true
  return !document.cookie.split("; ").includes("sidebar_state=false")
}
