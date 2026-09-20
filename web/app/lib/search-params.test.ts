import { describe, expect, it } from "vitest"

import {
  getHidden,
  getMode,
  getShowNoise,
  withHiddenToggled,
  withMode,
  withShowNoise,
} from "./search-params"

const params = (query: string) => new URLSearchParams(query)

describe("mode", () => {
  it("defaults to the latest positions", () => {
    expect(getMode(params(""))).toBe("latest")
    expect(getMode(params("view=nonsense"))).toBe("latest")
  })

  it("round-trips history, and leaves no trace of the default", () => {
    expect(getMode(withMode(params(""), "history"))).toBe("history")
    expect(withMode(params("view=history"), "latest").toString()).toBe("")
  })
})

describe("hidden beacons", () => {
  it("reads a comma-separated list", () => {
    expect(getHidden(params("hide=3,1"))).toEqual(new Set([3, 1]))
  })

  it.each(["hide=", "hide=abc", "hide=0", "hide=-2", "hide=1.5"])(
    "ignores what cannot be an id (%s)",
    (query) => {
      expect(getHidden(params(query))).toEqual(new Set())
    }
  )

  it("keeps the ids that are valid alongside ones that are not", () => {
    expect(getHidden(params("hide=3,abc,7"))).toEqual(new Set([3, 7]))
  })

  it("toggles an id on and back off", () => {
    const on = withHiddenToggled(params(""), 4)
    expect(on.get("hide")).toBe("4")
    expect(withHiddenToggled(on, 4).has("hide")).toBe(false)
  })

  it("adds to an existing list without disturbing other params", () => {
    const next = withHiddenToggled(params("hide=1&view=history"), 2)
    expect(getHidden(next)).toEqual(new Set([1, 2]))
    expect(next.get("view")).toBe("history")
  })
})

describe("noise", () => {
  it("hides unlikely reports unless asked", () => {
    expect(getShowNoise(params(""))).toBe(false)
    expect(getShowNoise(params("noise=show"))).toBe(true)
    expect(getShowNoise(params("noise=yes"))).toBe(false)
  })

  it("round-trips", () => {
    expect(withShowNoise(params(""), true).get("noise")).toBe("show")
    expect(withShowNoise(params("noise=show"), false).toString()).toBe("")
  })
})
