import type { ReactNode } from "react"
import { useEffect } from "react"

import { MapPanel } from "~/components/map-panel"
import { Map, MapControls, useMap } from "~/components/ui/map"
import { useMapStyle } from "~/lib/map-styles"

import { MapStylePicker } from "./map-style-picker"

type Props = {
  className?: string
  /** Extra controls grouped with the style picker, top-right (e.g. refresh). */
  controls?: ReactNode
  /** Bottom-left corner (e.g. tracking status). */
  status?: ReactNode
  /** Layers and overlays of the current page. */
  children?: ReactNode
}

/**
 * The one map every map page shares. Mounted once by the layout, so moving between pages glides
 * from the current view instead of starting over from a world view.
 */
export function MapStage({ className, controls, status, children }: Props) {
  const mapStyle = useMapStyle()
  return (
    <Map
      className={className}
      center={[0, 20]}
      zoom={1.5}
      styles={mapStyle.styles}
    >
      <ResizeWithContainer />
      <MapControls position="bottom-right" showZoom showCompass showLocate />
      <div className="pointer-events-none absolute top-3 right-3 z-10">
        <MapPanel>
          {controls}
          <MapStylePicker value={mapStyle.id} onChange={mapStyle.setId} />
        </MapPanel>
      </div>
      {status && (
        <div className="pointer-events-none absolute bottom-3 left-3 z-10 max-md:bottom-11">
          {status}
        </div>
      )}
      {children}
    </Map>
  )
}

/** MapLibre only follows window resizes; a panel opening beside it resizes just the container. */
function ResizeWithContainer() {
  const { map } = useMap()
  useEffect(() => {
    if (!map) return
    const observer = new ResizeObserver(() => map.resize())
    observer.observe(map.getContainer())
    return () => observer.disconnect()
  }, [map])
  return null
}
