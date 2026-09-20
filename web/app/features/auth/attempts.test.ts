import { describe, expect, it } from "vitest"

import type { Schemas } from "~/lib/api/client"

import { failureCount, isFailure, outcomeLabel, shortDevice } from "./attempts"

type Outcome = Schemas["LoginAttemptOut"]["outcome"]

const attempt = (outcome: Outcome): Schemas["LoginAttemptOut"] => ({
  at: "2026-09-20T10:00:00Z",
  client_ip: "203.0.113.4",
  user_agent: null,
  outcome,
})

describe("outcomes", () => {
  it("reads as plain English, not as an enum", () => {
    expect(outcomeLabel("success")).toBe("Signed in")
    expect(outcomeLabel("wrong_password")).toBe("Wrong password")
    expect(outcomeLabel("rate_limited")).toBe("Blocked after too many tries")
  })

  it("treats a recovery-code sign-in as a success, not a failure", () => {
    expect(isFailure("recovery_used")).toBe(false)
    expect(isFailure("success")).toBe(false)
    expect(isFailure("wrong_code")).toBe(true)
    expect(isFailure("rate_limited")).toBe(true)
  })

  it("counts only the failures", () => {
    const attempts = [
      attempt("success"),
      attempt("wrong_password"),
      attempt("wrong_code"),
      attempt("recovery_used"),
    ]
    expect(failureCount(attempts)).toBe(2)
    expect(failureCount([])).toBe(0)
  })
})

describe("device names", () => {
  it.each([
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      "Safari on iPhone",
    ],
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
      "Chrome on Mac",
    ],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0",
      "Edge on Windows",
    ],
    [
      "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0",
      "Firefox on Linux",
    ],
  ])("summarises %s", (userAgent, expected) => {
    expect(shortDevice(userAgent)).toBe(expected)
  })

  it("says so when there is nothing to go on", () => {
    expect(shortDevice(null)).toBe("Unknown device")
    expect(shortDevice("")).toBe("Unknown device")
  })

  it("falls back to the raw string it cannot read", () => {
    expect(shortDevice("curl/8.7.1")).toBe("curl/8.7.1")
  })
})
