import { DownloadIcon } from "lucide-react"

import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"

import { type HistoryFilters, exportHref } from "../api/locations"

export function ExportMenu({ filters }: { filters: HistoryFilters }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <DownloadIcon />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <ExportMenuItems filters={filters} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The export choices, for a menu of someone else's (the item page's "more" menu). */
export function ExportMenuItems({ filters }: { filters: HistoryFilters }) {
  return (
    <>
      <DropdownMenuLabel>Download what&apos;s shown</DropdownMenuLabel>
      <DropdownMenuItem asChild>
        <a href={exportHref(filters, "csv")} download>
          <DownloadIcon />
          CSV (spreadsheets)
        </a>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <a href={exportHref(filters, "geojson")} download>
          <DownloadIcon />
          GeoJSON (maps, GIS)
        </a>
      </DropdownMenuItem>
    </>
  )
}
