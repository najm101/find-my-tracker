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
