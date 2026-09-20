import type { ReactNode } from "react"
import { useEffect } from "react"

import { MapPanel } from "~/components/map-panel"
import { Map, MapControls, useMap } from "~/components/ui/map"
import { useIsMobile } from "~/hooks/use-mobile"
import { useMapStyle } from "~/lib/map-styles"

import { MapStylePicker } from "./map-style-picker"

type Props = {
  className?: string
  /** Extra controls grouped with the style picker, top-right (e.g. refresh). */
  controls?: ReactNode
  /** Bottom-left corner (e.g. tracking status). */
  status?: ReactNode
  /** Bottom-left, under the status (the phone's items sheet). */
  items?: ReactNode
  /** Layers and overlays of the current page. */
  children?: ReactNode
}

/**
 * The one map every map page shares. Mounted once by the layout, so moving between pages glides
 * from the current view instead of starting over from a world view.
 */
export function MapStage({
  className,
  controls,
  status,
  items,
  children,
}: Props) {
  const mapStyle = useMapStyle()
  const isMobile = useIsMobile()
  return (
    <Map
      className={className}
      center={[0, 20]}
      zoom={1.5}
      styles={mapStyle.styles}
    >
      <ResizeWithContainer />
      {/* A phone pinches to zoom, so the buttons are two more things covering the map. */}
      <MapControls
        position="bottom-right"
        showZoom={!isMobile}
        showCompass={!isMobile}
        showLocate
      />
      <div className="pointer-events-none absolute top-3 right-3 z-10">
        <MapPanel>
          {controls}
          <MapStylePicker value={mapStyle.id} onChange={mapStyle.setId} />
        </MapPanel>
      </div>
      {status && (
        <div className="pointer-events-none absolute bottom-3 left-3 z-10 max-md:bottom-16">
          {status}
        </div>
      )}
      {items && (
        // Overlays need pointer-events-none wrappers, or they swallow map clicks.
        <div className="pointer-events-none absolute bottom-3 left-3 z-10 [&>*]:pointer-events-auto">
          {items}
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
