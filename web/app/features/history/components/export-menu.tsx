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
        <DropdownMenuLabel>Download what&apos;s shown</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <a href={exportHref(filters, "csv")} download>
            CSV (spreadsheets)
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={exportHref(filters, "geojson")} download>
            GeoJSON (maps, GIS)
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
