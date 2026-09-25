import {
  ActivityIcon,
  CircleAlertIcon,
  LogOutIcon,
  MapIcon,
  MapPinnedIcon,
  RadarIcon,
  SettingsIcon,
} from "lucide-react"
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import { createPortal } from "react-dom"
import {
  Link,
  NavLink,
  Outlet,
  redirect,
  useLocation,
  useNavigate,
  useRevalidator,
  useRouteLoaderData,
  useSearchParams,
} from "react-router"

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import { MobileTabBar, type TabItem } from "~/components/mobile-tab-bar"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "~/components/ui/sidebar"
import { getAccount } from "~/features/apple-account/api/account"
import { isAuthenticated, logout } from "~/features/auth/api/auth"
import { listBeacons } from "~/features/beacons/api/beacons"
import { BeaconNav } from "~/features/beacons/components/beacon-nav"
import { MobileItemsSheet } from "~/features/beacons/components/mobile-items-sheet"
import { MapStage } from "~/features/map/components/map-stage"
import { getTrackingStatus } from "~/features/tracking/api/tracking"
import { RefreshButton } from "~/features/tracking/components/refresh-button"
import { TrackingStatus } from "~/features/tracking/components/tracking-status"
import { useIsMobile } from "~/hooks/use-mobile"
import { getHidden, withHiddenToggled } from "~/lib/search-params"

import type { Route } from "./+types/authed-layout"

/** Pages that replace the map instead of drawing on it (and the pages under them). */
const OFF_MAP = ["/setup", "/settings", "/status"]

function offMap(path: string): boolean {
  return OFF_MAP.some((p) => path === p || path.startsWith(`${p}/`))
}

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  if (!(await isAuthenticated())) throw redirect("/login")
  const account = await getAccount()
  const path = new URL(request.url).pathname
  // Without an account there is nothing to show but the wizard — except settings, which
  // is where the "connect an account" button lives.
  if (account.status === "none" && !offMap(path)) throw redirect("/setup")
  const [beacons, status] = await Promise.all([
    listBeacons(),
    getTrackingStatus(),
  ])
  return { account, beacons, status, loadedAt: Date.now() }
}

const NAV: TabItem[] = [
  { to: "/", label: "Map", icon: MapIcon, end: true, keepView: true },
  {
    to: "/places",
    label: "Near a place",
    icon: RadarIcon,
    end: false,
    keepView: true,
  },
  {
    to: "/status",
    label: "Status",
    icon: ActivityIcon,
    end: false,
    keepView: false,
  },
  {
    to: "/settings",
    label: "Settings",
    icon: SettingsIcon,
    end: false,
    keepView: false,
  },
]

/** The bottom bar has no room for "Near a place". */
const TAB_LABELS: Record<string, string> = { "/places": "Places" }

const TABS: TabItem[] = NAV.map((item) => ({
  ...item,
  label: TAB_LABELS[item.to] ?? item.label,
}))

/** Height of the bottom bar, plus whatever the phone reserves for its home indicator. */
const TAB_BAR_INSET = "calc(3.5rem + env(safe-area-inset-bottom))"

export default function AuthedLayout({ loaderData }: Route.ComponentProps) {
  const { account, beacons, status, loadedAt } = loaderData
  const navigate = useNavigate()
  const location = useLocation()
  const revalidator = useRevalidator()
  const [params, setParams] = useSearchParams()
  const hidden = getHidden(params)
  const activeId =
    Number(location.pathname.match(/^\/beacons\/(\d+)/)?.[1]) || null
  const onMap = !offMap(location.pathname)
  const connected = account.status !== "none"
  const [panelSlot, setPanelSlot] = useState<HTMLElement | null>(null)
  const isMobile = useIsMobile()

  // `revalidator` is a new object on every state change, so hold the function still:
  // the timer below must not restart each time a poll begins or ends.
  const revalidate = useRef(revalidator.revalidate)
  useEffect(() => {
    revalidate.current = revalidator.revalidate
  })

  // Keep the status and positions fresh: closely while a check runs, else every minute.
  // A hidden tab asks for nothing and catches up when it comes back.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void revalidate.current()
    }
    const id = setInterval(tick, status.running ? 3_000 : 60_000)
    document.addEventListener("visibilitychange", tick)
    return () => {
      clearInterval(id)
      document.removeEventListener("visibilitychange", tick)
    }
  }, [status.running])

  return (
    <SidebarProvider>
      <Sidebar className="hidden md:flex">
        <SidebarHeader>
          <Link
            to="/"
            className="flex items-center gap-2 px-2 py-1.5 font-medium"
          >
            <MapPinnedIcon className="size-5" />
            Find My Tracker
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      asChild
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
                        {item.label}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <BeaconNav
            beacons={beacons}
            hidden={hidden}
            activeId={activeId}
            now={loadedAt}
            onToggle={(id) =>
              setParams(withHiddenToggled(params, id), { replace: true })
            }
            addHref="/setup"
          />
        </SidebarContent>
        <SidebarFooter>
          <Button
            variant="ghost"
            size="sm"
            className="justify-start"
            onClick={async () => {
              await logout()
              navigate("/login")
            }}
          >
            <LogOutIcon />
            Log out
          </Button>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="relative min-h-svh overflow-hidden">
        {account.status === "needs_reauth" &&
          location.pathname !== "/setup" && (
            <div className="absolute inset-x-3 top-3 z-20 mx-auto max-w-xl md:top-16">
              <Alert variant="destructive" className="bg-background shadow-md">
                <CircleAlertIcon />
                <AlertTitle>Tracking is paused</AlertTitle>
                <AlertDescription>
                  {account.last_error ?? "Apple ended the saved session."} Sign
                  in again to resume.
                </AlertDescription>
                <AlertAction>
                  <Button size="sm" asChild>
                    <Link to="/setup">Sign in again</Link>
                  </Button>
                </AlertAction>
              </Alert>
            </div>
          )}
        {onMap ? (
          <PanelSlot.Provider value={panelSlot}>
            <div
              className="flex w-full flex-col md:h-svh md:flex-row"
              style={{
                height: `calc(100svh - ${isMobile ? TAB_BAR_INSET : "0px"})`,
              }}
            >
              <div className="relative min-h-0 flex-1">
                <MapStage
                  className="absolute inset-0"
                  items={
                    isMobile &&
                    connected && (
                      <MobileItemsSheet
                        beacons={beacons}
                        hidden={hidden}
                        activeId={activeId}
                        now={loadedAt}
                        onToggle={(id) =>
                          setParams(withHiddenToggled(params, id), {
                            replace: true,
                          })
                        }
                      />
                    )
                  }
                  controls={
                    connected && (
                      <RefreshButton status={status} now={loadedAt} />
                    )
                  }
                  status={
                    connected && (
                      <TrackingStatus status={status} now={loadedAt} />
                    )
                  }
                >
                  <Outlet />
                </MapStage>
              </div>
              <div
                ref={setPanelSlot}
                className="flex max-h-[55svh] min-h-0 empty:hidden md:max-h-none"
              />
            </div>
          </PanelSlot.Provider>
        ) : (
          <div style={{ paddingBottom: isMobile ? TAB_BAR_INSET : undefined }}>
            <Outlet />
          </div>
        )}
        <MobileTabBar items={TABS} />
      </SidebarInset>
    </SidebarProvider>
  )
}

const PanelSlot = createContext<HTMLElement | null>(null)

/**
 * A page's side panel, beside the shared map (below it on phones). Pages render inside the map,
 * so this portals out to the slot the layout keeps next to it; the map shrinks to make room.
 */
export function SidePanel({ children }: { children: ReactNode }) {
  const slot = useContext(PanelSlot)
  return slot ? createPortal(children, slot) : null
}

/** Data every signed-in page shares (beacons, tracking status), loaded once by the layout. */
export function useLayoutData() {
  const data = useRouteLoaderData<typeof clientLoader>("routes/authed-layout")
  if (!data)
    throw new Error("useLayoutData must be used under the authed layout")
  return data
}
