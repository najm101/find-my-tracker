import {
  BracesIcon,
  ChevronRightIcon,
  DatabaseIcon,
  KeyRoundIcon,
  type LucideIcon,
  PaletteIcon,
  RadioTowerIcon,
  RouteIcon,
  ShieldIcon,
  TagsIcon,
} from "lucide-react"
import { Link, NavLink } from "react-router"

import { buttonVariants } from "~/components/ui/button"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "~/components/ui/item"
import { cn } from "~/lib/utils"

type Section = {
  /** Under /settings. */
  to: string
  label: string
  description: string
  icon: LucideIcon
}

/** Settings, one page each: the order they're listed in. */
export const SETTINGS_SECTIONS: Section[] = [
  {
    to: "tracking",
    label: "Tracking",
    description: "How often the server checks Apple",
    icon: RadioTowerIcon,
  },
  {
    to: "items",
    label: "Items",
    description: "Names, colours, and which to check",
    icon: TagsIcon,
  },
  {
    to: "predicted-routes",
    label: "Predicted routes",
    description: "The routing engine and its map data",
    icon: RouteIcon,
  },
  {
    to: "data",
    label: "Data",
    description: "How long history is kept",
    icon: DatabaseIcon,
  },
  {
    to: "account",
    label: "Apple account",
    description: "The account your items belong to",
    icon: KeyRoundIcon,
  },
  {
    to: "security",
    label: "Security",
    description: "Password, two-factor, and sign-ins",
    icon: ShieldIcon,
  },
  {
    to: "appearance",
    label: "Appearance",
    description: "Light or dark, in this browser",
    icon: PaletteIcon,
  },
  {
    to: "api",
    label: "API",
    description: "Documentation for this server's API",
    icon: BracesIcon,
  },
]

/** Beside the page on wider screens. */
export function SettingsNav() {
  return (
    <nav aria-label="Settings" className="flex flex-col gap-0.5">
      {SETTINGS_SECTIONS.map((s) => (
        <NavLink
          key={s.to}
          to={`/settings/${s.to}`}
          className={({ isActive }) =>
            cn(
              buttonVariants({ variant: "ghost" }),
              "justify-start",
              isActive && "bg-muted text-foreground"
            )
          }
        >
          <s.icon />
          {s.label}
        </NavLink>
      ))}
    </nav>
  )
}

/** The whole page on a phone: one row per section. */
export function SettingsList() {
  return (
    <ItemGroup className="gap-2">
      {SETTINGS_SECTIONS.map((s) => (
        <Item key={s.to} variant="outline" asChild>
          <Link to={`/settings/${s.to}`}>
            <ItemMedia variant="icon">
              <s.icon />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{s.label}</ItemTitle>
              <ItemDescription>{s.description}</ItemDescription>
            </ItemContent>
            <ItemActions>
              <ChevronRightIcon className="size-4 text-muted-foreground" />
            </ItemActions>
          </Link>
        </Item>
      ))}
    </ItemGroup>
  )
}
