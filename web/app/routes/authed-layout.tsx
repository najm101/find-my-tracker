import {
  CircleAlertIcon,
  LogOutIcon,
  MapIcon,
  MapPinnedIcon,
  RadarIcon,
} from "lucide-react"
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
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
  SidebarTrigger,
} from "~/components/ui/sidebar"
import { getAccount } from "~/features/apple-account/api/account"
import { isAuthenticated, logout } from "~/features/auth/api/auth"
import { listBeacons } from "~/features/beacons/api/beacons"
import { BeaconNav } from "~/features/beacons/components/beacon-nav"
import { MapStage } from "~/features/map/components/map-stage"
import { getTrackingStatus } from "~/features/tracking/api/tracking"
import { RefreshButton } from "~/features/tracking/components/refresh-button"
import { TrackingStatus } from "~/features/tracking/components/tracking-status"
import { getHidden, withHiddenToggled } from "~/lib/search-params"

import type { Route } from "./+types/authed-layout"

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  if (!(await isAuthenticated())) throw redirect("/login")
  const account = await getAccount()
  const path = new URL(request.url).pathname
  if (account.status === "none" && path !== "/setup") throw redirect("/setup")
  const [beacons, status] = await Promise.all([
    listBeacons(),
    getTrackingStatus(),
  ])
  return { account, beacons, status, loadedAt: Date.now() }
}

const NAV = [
  { to: "/", label: "Map", icon: MapIcon, end: true },
  { to: "/places", label: "Near a place", icon: RadarIcon, end: false },
]

export default function AuthedLayout({ loaderData }: Route.ComponentProps) {
  const { account, beacons, status, loadedAt } = loaderData
  const navigate = useNavigate()
  const location = useLocation()
  const revalidator = useRevalidator()
  const [params, setParams] = useSearchParams()
  const hidden = getHidden(params)
  const activeId =
    Number(location.pathname.match(/^\/beacons\/(\d+)/)?.[1]) || null
  const onMap = location.pathname !== "/setup"
  const connected = account.status !== "none"
  const [panelSlot, setPanelSlot] = useState<HTMLElement | null>(null)

  // Keep the status and positions fresh: closely while a check runs, else every minute.
  useEffect(() => {
    const id = setInterval(
      () => revalidator.revalidate(),
      status.running ? 3_000 : 60_000
    )
    return () => clearInterval(id)
  }, [status.running, revalidator])

  return (
    <SidebarProvider>
      <Sidebar>
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
                        to={{ pathname: item.to, search: params.toString() }}
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
        <SidebarTrigger className="absolute top-3 left-3 z-20 bg-background shadow-sm md:hidden" />
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
            <div className="flex h-svh w-full flex-col md:flex-row">
              <div className="relative min-h-0 flex-1">
                <MapStage
                  className="absolute inset-0"
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
          <Outlet />
        )}
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
