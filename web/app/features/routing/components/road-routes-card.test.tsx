import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { RouterProvider, createMemoryRouter } from "react-router"
import { describe, expect, it } from "vitest"

import type { Schemas } from "~/lib/api/client"

import { RoadRoutesCard } from "./road-routes-card"
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
  message: "Road routes are off.",
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

describe("RoadRoutesCard", () => {
  it("offers the three ways when nothing is set up", () => {
    renderRouted(<RoadRoutesCard routing={off} now={NOW} />)
    expect(screen.getByRole("radio", { name: /off/i })).toBeChecked()
    expect(screen.getByRole("radio", { name: /built in/i })).toBeInTheDocument()
    expect(
      screen.getByRole("radio", { name: /another valhalla server/i })
    ).toBeInTheDocument()
  })

  it("shows the built-in engine ready, with its regions", () => {
    renderRouted(<RoadRoutesCard routing={builtin()} now={NOW} />)
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
    renderRouted(<RoadRoutesCard routing={status} now={NOW} />)
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
    renderRouted(<RoadRoutesCard routing={status} now={NOW} />)
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
    renderRouted(<RoadRoutesCard routing={status} now={NOW} />)
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
    pending: 0,
    ...patch,
  })

  it("points to Settings and the guide when road routes aren't set up", () => {
    renderRouted(
      <RoutesNotice
        routes={routes({ state: "off", message: "Road routes are off." })}
      />
    )
    expect(screen.getByText("Road routes aren't set up")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Set up" })).toHaveAttribute(
      "href",
      "/settings#road-routes"
    )
    expect(screen.getByRole("link", { name: /guide/i })).toHaveAttribute(
      "href",
      expect.stringContaining("#road-routes")
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

  it("says when trips are still being matched", () => {
    renderRouted(<RoutesNotice routes={routes({ pending: 3 })} />)
    expect(
      screen.getByText(/finding the roads for 3 more trips/i)
    ).toBeInTheDocument()
  })

  it("says the roads are being found before the first answer", () => {
    renderRouted(<RoutesNotice routes={undefined} loading />)
    expect(screen.getByText("Finding the roads…")).toBeInTheDocument()
  })

  it("says nothing when all is well", () => {
    const { container } = renderRouted(<RoutesNotice routes={routes({})} />)
    expect(container).toBeEmptyDOMElement()
  })
})
