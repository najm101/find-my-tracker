import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { Schemas } from "~/lib/api/client"

import { PollRunsTable } from "./poll-runs-table"

type Run = Schemas["PollRunOut"]

const run = (overrides: Partial<Run> = {}): Run => ({
  id: 1,
  trigger: "schedule",
  started_at: "2026-09-20T12:00:00Z",
  finished_at: "2026-09-20T12:00:09Z",
  outcome: "ok",
  beacons_polled: 3,
  reports_seen: 1234,
  new_locations: 12,
  error: null,
  ...overrides,
})

const rowFor = (name: RegExp) => screen.getByRole("row", { name })

describe("PollRunsTable", () => {
  it("says so when nothing has run yet", () => {
    render(<PollRunsTable runs={[]} />)
    expect(screen.getByText(/no checks yet/i)).toBeInTheDocument()
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
  })

  it("reports what a check found", () => {
    render(<PollRunsTable runs={[run()]} />)
    const row = rowFor(/OK/)
    expect(within(row).getByText("Scheduled")).toBeInTheDocument()
    expect(within(row).getByText("9 s")).toBeInTheDocument()
    expect(within(row).getByText("1,234")).toBeInTheDocument()
  })

  it("marks a check that is still going", () => {
    render(<PollRunsTable runs={[run({ outcome: null, finished_at: null })]} />)
    const row = rowFor(/Running/)
    expect(within(row).getByText("—")).toBeInTheDocument()
  })

  it.each([
    ["auth_failed", "Sign-in expired"],
    ["apple_error", "Apple error"],
    ["error", "Failed"],
  ] as const)("names the %s outcome", (outcome, label) => {
    render(<PollRunsTable runs={[run({ outcome })]} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it("shows the error text with the failed run", () => {
    render(
      <PollRunsTable
        runs={[run({ outcome: "apple_error", error: "Apple returned 503." })]}
      />
    )
    expect(
      within(rowFor(/Apple error/)).getByText("Apple returned 503.")
    ).toBeInTheDocument()
  })

  it("lists every run it is given", () => {
    render(
      <PollRunsTable
        runs={[run({ id: 1 }), run({ id: 2, trigger: "manual" })]}
      />
    )
    // One header row plus the two runs.
    expect(screen.getAllByRole("row")).toHaveLength(3)
    expect(screen.getByText("Manual")).toBeInTheDocument()
  })
})
