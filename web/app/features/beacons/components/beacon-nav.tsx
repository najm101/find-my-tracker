import {
  ArrowDownUpIcon,
  BatteryLowIcon,
  EyeIcon,
  EyeOffIcon,
  PlusIcon,
} from "lucide-react"
import { useState } from "react"
import { Link } from "react-router"

import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInput,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/components/ui/sidebar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip"
import type { Schemas } from "~/lib/api/client"
import { BEACON_KINDS } from "~/lib/beacon-kind"
import { timeAgo } from "~/lib/format"
import { type Freshness, freshness } from "~/lib/freshness"
import { cn } from "~/lib/utils"

type Beacon = Schemas["BeaconOut"]

type Props = {
  beacons: Beacon[]
  hidden: Set<number>
  activeId?: number | null
  now: number
  onToggle: (id: number) => void
  /** Hide exactly these (none: show them all). */
  onSetHidden: (ids: number[]) => void
  addHref: string
}

type Sort = "added" | "name" | "seen"

const SORTS: { value: Sort; label: string }[] = [
  { value: "added", label: "Order added" },
  { value: "name", label: "Name" },
  { value: "seen", label: "Last seen" },
]

/** From this many items on, the list gets a search box. */
const SEARCH_FROM = 6
const SORT_KEY = "fmt-items-sort"

const DOT: Record<Freshness, string> = {
  fresh: "bg-primary",
  recent: "bg-amber-500",
  stale: "bg-muted-foreground/50",
  none: "bg-muted-foreground/30",
}

/**
 * The tracked items, each linking to its history, with a show/hide toggle for the map. A dot on
 * each says how recently it was seen: within the hour, the day, or longer ago.
 */
export function BeaconNav({
  beacons,
  hidden,
  activeId,
  now,
  onToggle,
  onSetHidden,
  addHref,
}: Props) {
  const [sort, setSort] = useState<Sort>(readSort)
  const [query, setQuery] = useState("")
  const q = query.trim().toLowerCase()
  const listed = sorted(
    beacons.filter((b) => !q || b.name.toLowerCase().includes(q)),
    sort
  )
  const allHidden = beacons.length > 0 && beacons.every((b) => hidden.has(b.id))

  function chooseSort(value: string) {
    setSort(value as Sort)
    try {
      localStorage.setItem(SORT_KEY, value)
    } catch {
      // private window: it just isn't remembered
    }
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel>
        Items
        <span className="ml-1 tabular-nums">· {beacons.length}</span>
      </SidebarGroupLabel>
      <div className="absolute top-3 right-2 flex items-center group-data-[collapsible=icon]:hidden">
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-xs" aria-label="Sort items">
                  <ArrowDownUpIcon />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Sort</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuLabel>Sort by</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={sort} onValueChange={chooseSort}>
              {SORTS.map((s) => (
                <DropdownMenuRadioItem key={s.value} value={s.value}>
                  {s.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        {beacons.length > 1 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={
                  allHidden ? "Show all on the map" : "Hide all on the map"
                }
                onClick={() =>
                  onSetHidden(allHidden ? [] : beacons.map((b) => b.id))
                }
              >
                {allHidden ? <EyeOffIcon /> : <EyeIcon />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {allHidden ? "Show all on the map" : "Hide all on the map"}
            </TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-xs" asChild>
              <Link to={addHref} aria-label="Add items">
                <PlusIcon />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Add items</TooltipContent>
        </Tooltip>
      </div>
      <SidebarGroupContent className="flex flex-col gap-2">
        {beacons.length >= SEARCH_FROM && (
          <SidebarInput
            type="search"
            placeholder="Search items"
            aria-label="Search items"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="group-data-[collapsible=icon]:hidden"
          />
        )}
        <SidebarMenu>
          {beacons.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              Nothing tracked yet.
            </p>
          )}
          {q && listed.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              No item called that.
            </p>
          )}
          {listed.map((b) => {
            const kind = BEACON_KINDS[b.kind]
            const isHidden = hidden.has(b.id)
            const lowBattery = b.battery === "low" || b.battery === "very_low"
            const fresh = b.enabled
              ? freshness(b.latest?.observed_at, now)
              : "none"
            const seen = !b.enabled
              ? "Paused"
              : b.latest
                ? `Seen ${timeAgo(b.latest.observed_at, now)}`
                : "Not located yet"
            return (
              <SidebarMenuItem key={b.id}>
                <SidebarMenuButton
                  asChild
                  isActive={b.id === activeId}
                  size="lg"
                  tooltip={`${b.name} · ${seen}${isHidden ? " · hidden" : ""}`}
                  className={cn(isHidden && "opacity-50")}
                >
                  <Link to={`/beacons/${b.id}`}>
                    <span
                      className="relative flex size-8 shrink-0 items-center justify-center rounded-full text-white"
                      style={{ backgroundColor: b.color ?? "#2563eb" }}
                    >
                      {b.emoji ? (
                        <span className="text-sm">{b.emoji}</span>
                      ) : (
                        <kind.icon className="size-4" />
                      )}
                      <span
                        aria-hidden
                        className={cn(
                          "absolute right-0 bottom-0 size-2.5 rounded-full border-2 border-sidebar",
                          DOT[fresh]
                        )}
                      />
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
                        {seen}
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

function readSort(): Sort {
  try {
    const saved = localStorage.getItem(SORT_KEY)
    if (SORTS.some((s) => s.value === saved)) return saved as Sort
  } catch {
    // no storage: the default
  }
  return "added"
}

function sorted(beacons: Beacon[], sort: Sort): Beacon[] {
  if (sort === "added") return beacons
  const list = [...beacons]
  if (sort === "name") return list.sort((a, b) => a.name.localeCompare(b.name))
  // Last seen first; never seen last.
  const seenAt = (b: Beacon) =>
    b.latest ? Date.parse(b.latest.observed_at) : Number.NEGATIVE_INFINITY
  return list.sort((a, b) => seenAt(b) - seenAt(a))
}
