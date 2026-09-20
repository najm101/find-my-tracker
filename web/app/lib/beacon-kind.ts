import {
  CircleDotIcon,
  HeadphonesIcon,
  LaptopIcon,
  type LucideIcon,
  SmartphoneIcon,
  TabletIcon,
  TagIcon,
  WatchIcon,
} from "lucide-react"

import type { Schemas } from "~/lib/api/client"

type Kind = Schemas["BeaconKind"]

export const BEACON_KINDS: Record<Kind, { label: string; icon: LucideIcon }> = {
  airtag: { label: "AirTag", icon: CircleDotIcon },
  iphone: { label: "iPhone", icon: SmartphoneIcon },
  ipad: { label: "iPad", icon: TabletIcon },
  mac: { label: "Mac", icon: LaptopIcon },
  watch: { label: "Apple Watch", icon: WatchIcon },
  airpods: { label: "AirPods", icon: HeadphonesIcon },
  other: { label: "Find My accessory", icon: TagIcon },
}

/** Marker and path colours, matching the palette the server assigns on import. */
export const BEACON_COLORS = [
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#d97706",
  "#9333ea",
  "#0891b2",
  "#db2777",
  "#65a30d",
] as const

export const DEFAULT_BEACON_COLOR = BEACON_COLORS[0]
