import { PlusIcon } from "lucide-react"
import { useState } from "react"

import { Button } from "~/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover"
import { Spinner } from "~/components/ui/spinner"
import { ApiError, type Schemas } from "~/lib/api/client"

import { getRegionCatalog } from "../api/routing"

type Region = Schemas["CatalogRegion"]

/** Search every region Geofabrik offers; the list loads the first time it is opened. */
export function RegionPicker({
  have,
  disabled,
  onPick,
}: {
  /** Regions already added: not offered again. */
  have: Set<string>
  disabled?: boolean
  onPick: (region: Region) => void
}) {
  const [open, setOpen] = useState(false)
  const [regions, setRegions] = useState<Region[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function openChange(next: boolean) {
    setOpen(next)
    if (next && regions === null) {
      try {
        setRegions(await getRegionCatalog())
        setError(null)
      } catch (e) {
        setError(
          e instanceof ApiError ? e.message : "Couldn't load the regions."
        )
      }
    }
  }

  return (
    <Popover open={open} onOpenChange={openChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <PlusIcon />
          Add a region
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command>
          <CommandInput placeholder="Country, state or region…" />
          <CommandList>
            {regions === null ? (
              <div className="flex items-center justify-center gap-2 p-4 text-sm text-muted-foreground">
                {error ?? (
                  <>
                    <Spinner /> Loading regions
                  </>
                )}
              </div>
            ) : (
              <>
                <CommandEmpty>No region by that name.</CommandEmpty>
                {regions
                  .filter((r) => !have.has(r.id))
                  .map((r) => (
                    <CommandItem
                      key={r.id}
                      value={`${r.name} ${r.parent ?? ""} ${r.id}`}
                      onSelect={() => {
                        onPick(r)
                        setOpen(false)
                      }}
                    >
                      <span className="truncate">{r.name}</span>
                      {r.parent && (
                        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                          {r.parent}
                        </span>
                      )}
                    </CommandItem>
                  ))}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
