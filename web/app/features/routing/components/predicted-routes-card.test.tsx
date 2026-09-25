import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { RouterProvider, createMemoryRouter } from "react-router"
import { describe, expect, it } from "vitest"

import type { Schemas } from "~/lib/api/client"

import { PredictedRoutesCard } from "./predicted-routes-card"
import { RouteModeToggle } from "./route-mode-toggle"
import { RoutesNotice } from "./routes-notice"

type Status = Schemas["RoutingStatus"]

// The card refreshes itself through the router; give it one.
function renderRouted(ui: ReactNode) {
  const router = createMemoryRouter([{ path: "/", element: ui }])
  return render(<RouterProvider router={router} />)
}

const NOW = Date.parse("2026-09-24T12:00:00Z")

const off: Status = {
  mode: "off",
  configured_by_env: false,
  ready: false,
  message: "Predicted routes are off.",
  builtin: null,
  external: null,
  missing_regions: [],
  catalog_available: false,
}

const region = (
  patch: Partial<Schemas["RegionOut"]> = {}
): Schemas["RegionOut"] => ({
  id: "egypt",
  name: "Egypt",
  status: "downloaded",
  auto: true,
  size_bytes: 178_506_071,
  error: null,
  in_use: true,
  progress: null,
  ...patch,
})

const builtin = (patch: Partial<Schemas["BuiltinOut"]> = {}): Status => ({
  ...off,
  mode: "builtin",
  ready: true,
  message: null,
  builtin: {
    phase: "idle",
    detail: null,
    progress: null,
    serving: true,
    built_at: "2026-09-24T11:00:00Z",
    regions: [region()],
    disk_bytes: 920_000_000,
    error: null,
    auto_download: true,
    ...patch,
  },
})

describe("PredictedRoutesCard", () => {
  it("offers the three ways when nothing is set up", () => {
    renderRouted(<PredictedRoutesCard routing={off} now={NOW} />)
    expect(screen.getByRole("radio", { name: /off/i })).toBeChecked()
    expect(screen.getByRole("radio", { name: /built in/i })).toBeInTheDocument()
    expect(
      screen.getByRole("radio", { name: /another valhalla server/i })
    ).toBeInTheDocument()
  })

  it("shows the built-in engine ready, with its regions", () => {
    renderRouted(<PredictedRoutesCard routing={builtin()} now={NOW} />)
    expect(screen.getByText("Ready")).toBeInTheDocument()
    expect(
      screen.getByText(/road data prepared 1 hour ago/i)
    ).toBeInTheDocument()
    expect(screen.getByText("Ready · 179 MB")).toBeInTheDocument()
    expect(screen.getByText("Automatic")).toBeInTheDocument()
    expect(
      screen.getByRole("switch", { name: /download map data automatically/i })
    ).toBeChecked()
    expect(screen.getByText("Map data uses 920 MB.")).toBeInTheDocument()
  })

  it("shows a download under way", () => {
    const status = builtin({
      phase: "downloading",
      detail: "Egypt",
      progress: 0.45,
      serving: false,
      built_at: null,
      regions: [
        region({ status: "downloading", progress: 0.45, in_use: false }),
      ],
    })
    renderRouted(<PredictedRoutesCard routing={status} now={NOW} />)
    expect(screen.getByText(/downloading egypt · 45%/i)).toBeInTheDocument()
    expect(screen.getByRole("progressbar")).toBeInTheDocument()
  })

  it("asks before a big download, and names what's missing", () => {
    const status = builtin({
      regions: [
        region({ status: "too_large", size_bytes: 1.9e9, in_use: false }),
      ],
    })
    status.missing_regions = [
      { id: "libya", name: "Libya", beacons: ["Suzuki", "Hyundai"] },
    ]
    renderRouted(<PredictedRoutesCard routing={status} now={NOW} />)
    expect(
      screen.getByText("Too big to download automatically (1.9 GB)")
    ).toBeInTheDocument()
    expect(
      screen.getByText(/recent history of suzuki, hyundai/i)
    ).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: "Download" })).toHaveLength(2)
  })

  it("shows a server set by the environment, fixed", () => {
    const status: Status = {
      ...off,
      mode: "external",
      configured_by_env: true,
      ready: true,
      message: null,
      external: {
        url: "http://valhalla:8002",
        reachable: true,
        version: "3.9.0",
        error: null,
      },
    }
    renderRouted(<PredictedRoutesCard routing={status} now={NOW} />)
    expect(screen.getByText("http://valhalla:8002")).toBeInTheDocument()
    expect(screen.getByText("Connected")).toBeInTheDocument()
    expect(
      screen.getByText(/set by this server's routing_url/i)
    ).toBeInTheDocument()
    expect(screen.queryByRole("radio")).not.toBeInTheDocument()
  })
})

describe("RoutesNotice", () => {
  const routes = (patch: Partial<Schemas["RoutesResponse"]>) => ({
    state: "ok" as const,
    message: null,
    trips: [],
    progress: null,
    ...patch,
  })

  it("points to Settings and the guide when predicted routes aren't set up", () => {
    renderRouted(
      <RoutesNotice
        routes={routes({ state: "off", message: "Predicted routes are off." })}
      />
    )
    expect(
      screen.getByText("Predicted routes aren't set up")
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Set up" })).toHaveAttribute(
      "href",
      "/settings/predicted-routes"
    )
    expect(screen.getByRole("link", { name: /guide/i })).toHaveAttribute(
      "href",
      expect.stringContaining("#predicted-routes")
    )
  })

  it("passes on why the engine isn't available", () => {
    renderRouted(
      <RoutesNotice
        routes={routes({
          state: "unavailable",
          message: "Downloading map data (Egypt).",
        })}
      />
    )
    expect(
      screen.getByText("Downloading map data (Egypt).")
    ).toBeInTheDocument()
  })

  it("says nothing while matching, or when all is well", () => {
    const matching = routes({
      progress: { job: "j", done: 0.4, trips_left: 3, received: 1 },
    })
    const quiet = renderRouted(<RoutesNotice routes={matching} />)
    expect(quiet.container).toBeEmptyDOMElement()
    const well = renderRouted(<RoutesNotice routes={routes({})} />)
    expect(well.container).toBeEmptyDOMElement()
  })
})

describe("RouteModeToggle", () => {
  const noop = () => {}

  it("fills the chosen mode's button as the routes are found", () => {
    render(<RouteModeToggle mode="predicted" progress={0.42} onMode={noop} />)
    const button = screen.getByRole("radio", { name: /predicted/i })
    expect(button).toHaveAccessibleName("Predicted, 42% found")
    expect(screen.getByTestId("route-progress")).toHaveStyle({ width: "42%" })
    expect(screen.getByRole("radiogroup")).toHaveAttribute("aria-busy", "true")
  })

  it("spins until the progress is known, and is quiet when done", () => {
    const { rerender } = render(
      <RouteModeToggle mode="both" busy onMode={noop} />
    )
    expect(screen.queryByTestId("route-progress")).toBeNull()
    expect(screen.getByRole("radiogroup")).toHaveAttribute("aria-busy", "true")
    rerender(<RouteModeToggle mode="both" onMode={noop} />)
    expect(screen.getByRole("radiogroup")).toHaveAttribute("aria-busy", "false")
    expect(screen.getByRole("radio", { name: "Both" })).toBeInTheDocument()
  })
})
