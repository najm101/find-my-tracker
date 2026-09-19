import type { StyleSpecification } from "maplibre-gl"
import { useCallback, useSyncExternalStore } from "react"

/**
 * Base maps. Street styles are OpenFreeMap (OpenStreetMap data, no API key). Satellite is Esri
 * World Imagery, free to use with attribution.
 */

const OFM = "https://tiles.openfreemap.org/styles"
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services"
const ESRI_ATTRIBUTION =
  "Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community"

function satellite(withLabels: boolean): StyleSpecification {
  return {
    version: 8,
    sources: {
      imagery: {
        type: "raster",
        tiles: [`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`],
        tileSize: 256,
        maxzoom: 19,
        attribution: ESRI_ATTRIBUTION,
      },
      ...(withLabels && {
        labels: {
          type: "raster",
          tiles: [
            `${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`,
          ],
          tileSize: 256,
          maxzoom: 19,
        },
      }),
    },
    layers: [
      { id: "imagery", type: "raster", source: "imagery" },
      ...(withLabels
        ? [{ id: "labels", type: "raster" as const, source: "labels" }]
        : []),
    ],
  }
}

export type MapStyleId =
  "auto" | "light" | "dark" | "streets" | "bright" | "satellite" | "hybrid"

type StylePair = {
  light: string | StyleSpecification
  dark: string | StyleSpecification
}

export const MAP_STYLES: {
  id: MapStyleId
  label: string
  styles: StylePair
}[] = [
  {
    id: "auto",
    label: "Auto (light / dark)",
    styles: { light: `${OFM}/positron`, dark: `${OFM}/dark` },
  },
  {
    id: "light",
    label: "Light",
    styles: { light: `${OFM}/positron`, dark: `${OFM}/positron` },
  },
  {
    id: "dark",
    label: "Dark",
    styles: { light: `${OFM}/dark`, dark: `${OFM}/dark` },
  },
  {
    id: "streets",
    label: "Streets",
    styles: { light: `${OFM}/liberty`, dark: `${OFM}/liberty` },
  },
  {
    id: "bright",
    label: "Bright",
    styles: { light: `${OFM}/bright`, dark: `${OFM}/bright` },
  },
  {
    id: "satellite",
    label: "Satellite",
    styles: { light: satellite(false), dark: satellite(false) },
  },
  {
    id: "hybrid",
    label: "Satellite with labels",
    styles: { light: satellite(true), dark: satellite(true) },
  },
]

// ---- per-browser preference (a viewing choice, not app state) ----

const KEY = "fmt:map-style"
const listeners = new Set<() => void>()

function read(): MapStyleId {
  try {
    const value = localStorage.getItem(KEY) as MapStyleId | null
    return MAP_STYLES.some((s) => s.id === value) ? value! : "auto"
  } catch {
    return "auto"
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The chosen base map, shared by every map on the page and remembered in this browser. */
export function useMapStyle() {
  const id = useSyncExternalStore(subscribe, read, () => "auto" as MapStyleId)
  const setId = useCallback((next: MapStyleId) => {
    try {
      localStorage.setItem(KEY, next)
    } catch {
      // private mode: the choice lasts for this page only
    }
    for (const l of listeners) l()
  }, [])
  const style = MAP_STYLES.find((s) => s.id === id) ?? MAP_STYLES[0]
  return { id, styles: style.styles, setId }
}
