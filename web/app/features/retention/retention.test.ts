import { describe, expect, it } from "vitest"

import { mayDelete, retentionLabel } from "./retention"

describe("mayDelete", () => {
  it("is only a shorter period, or a first one", () => {
    expect(mayDelete(null, 30)).toBe(true) // keeping everything → 30 days
    expect(mayDelete(60, 30)).toBe(true) // 60 → 30 days
    expect(mayDelete(30, 60)).toBe(false) // longer: nothing goes now
    expect(mayDelete(30, null)).toBe(false) // keep everything from now on
    expect(mayDelete(30, 30)).toBe(false)
  })
})

describe("retentionLabel", () => {
  it("names the periods as offered", () => {
    expect(retentionLabel(182)).toBe("6 months")
    expect(retentionLabel(45)).toBe("45 days")
  })
})
