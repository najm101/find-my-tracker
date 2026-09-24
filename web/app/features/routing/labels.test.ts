import { describe, expect, it } from "vitest"

import type { Schemas } from "~/lib/api/client"

import { isBusy, regionStatus } from "./labels"

const region = (
  patch: Partial<Schemas["RegionOut"]>
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

describe("regionStatus", () => {
  it.each([
    [{ status: "queued" }, "Waiting to download"],
    [{ status: "downloading", progress: 0.45 }, "Downloading · 45% of 179 MB"],
    [{}, "Ready · 179 MB"],
    [{ in_use: false }, "Downloaded, waiting for the road data to be built"],
    [
      { status: "too_large", size_bytes: 1.9e9 },
      "Too big to download automatically (1.9 GB)",
    ],
    [
      { status: "failed", error: "Not enough free disk space" },
      "Not enough free disk space",
    ],
  ] as [Partial<Schemas["RegionOut"]>, string][])("%o", (patch, expected) => {
    expect(regionStatus(region(patch))).toBe(expected)
  })
})

describe("isBusy", () => {
  const builtin = (
    patch: Partial<Schemas["BuiltinOut"]>
  ): Schemas["BuiltinOut"] => ({
    phase: "idle",
    detail: null,
    progress: null,
    serving: true,
    built_at: null,
    regions: [],
    disk_bytes: 0,
    error: null,
    auto_download: true,
    ...patch,
  })

  it("is busy while downloading or building", () => {
    expect(isBusy(builtin({ phase: "building" }))).toBe(true)
    expect(isBusy(builtin({ regions: [region({ status: "queued" })] }))).toBe(
      true
    )
    expect(isBusy(builtin({ regions: [region({})] }))).toBe(false)
    expect(isBusy(null)).toBe(false)
  })
})
