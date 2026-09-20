import { BatteryLowIcon, EyeIcon, EyeOffIcon } from "lucide-react"
import { Link } from "react-router"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip"
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/components/ui/sidebar"
import type { Schemas } from "~/lib/api/client"
import { BEACON_KINDS } from "~/lib/beacon-kind"
import { timeAgo } from "~/lib/format"
import { cn } from "~/lib/utils"

type Beacon = Schemas["BeaconOut"]

type Props = {
  beacons: Beacon[]
  hidden: Set<number>
  activeId?: number | null
  now: number
  onToggle: (id: number) => void
  addHref: string
}

/** The tracked items, each linking to its history, with a show/hide toggle for the map. */
export function BeaconNav({
  beacons,
  hidden,
  activeId,
  now,
  onToggle,
  addHref,
}: Props) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Items</SidebarGroupLabel>
      <SidebarGroupAction asChild title="Add items">
        <Link to={addHref}>
          <span className="text-base leading-none">+</span>
          <span className="sr-only">Add items</span>
        </Link>
      </SidebarGroupAction>
      <SidebarGroupContent>
        <SidebarMenu>
          {beacons.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              Nothing tracked yet.
            </p>
          )}
          {beacons.map((b) => {
            const kind = BEACON_KINDS[b.kind]
            const isHidden = hidden.has(b.id)
            const lowBattery = b.battery === "low" || b.battery === "very_low"
            return (
              <SidebarMenuItem key={b.id}>
                <SidebarMenuButton
                  asChild
                  isActive={b.id === activeId}
                  size="lg"
                  tooltip={b.name}
                  className={cn(isHidden && "opacity-50")}
                >
                  <Link to={`/beacons/${b.id}`}>
                    <span
                      className="flex size-8 shrink-0 items-center justify-center rounded-full text-white"
                      style={{ backgroundColor: b.color ?? "#2563eb" }}
                    >
                      {b.emoji ? (
                        <span className="text-sm">{b.emoji}</span>
                      ) : (
                        <kind.icon className="size-4" />
                      )}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="flex items-center gap-1 truncate font-medium">
                        {b.name}
                        {lowBattery && (
                          <BatteryLowIcon
                            className="size-3.5 text-destructive"
                            aria-label="Low battery"
                          />
                        )}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {!b.enabled
                          ? "Paused"
                          : b.latest
                            ? `Seen ${timeAgo(b.latest.observed_at, now)}`
                            : "Not located yet"}
                      </span>
                    </span>
                  </Link>
                </SidebarMenuButton>
                {/* Always visible: revealing it on hover would put it out of reach on touch. */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <SidebarMenuAction
                      onClick={() => onToggle(b.id)}
                      aria-label={
                        isHidden
                          ? `Show ${b.name} on the map`
                          : `Hide ${b.name} on the map`
                      }
                      className="top-1/2! -translate-y-1/2"
                    >
                      {isHidden ? <EyeOffIcon /> : <EyeIcon />}
                    </SidebarMenuAction>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    {isHidden ? "Show on map" : "Hide on map"}
                  </TooltipContent>
                </Tooltip>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
