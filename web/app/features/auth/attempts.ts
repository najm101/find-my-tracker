import type { Schemas } from "~/lib/api/client"

type Attempt = Schemas["LoginAttemptOut"]
type Outcome = Attempt["outcome"]

/** What each recorded outcome should read as in the sign-in history. */
const LABELS: Record<Outcome, string> = {
  success: "Signed in",
  wrong_password: "Wrong password",
  wrong_code: "Wrong code",
  recovery_used: "Signed in with a recovery code",
  rate_limited: "Blocked after too many tries",
}

export function outcomeLabel(outcome: Outcome): string {
  return LABELS[outcome] ?? outcome
}

/** A failed try is worth the reader's attention; a successful one is routine. */
export function isFailure(outcome: Outcome): boolean {
  return outcome !== "success" && outcome !== "recovery_used"
}

/** How many of these failed, so the card can say "3 failed tries" without a second pass. */
export function failureCount(attempts: Attempt[]): number {
  return attempts.filter((a) => isFailure(a.outcome)).length
}

/**
 * Browsers send long user-agent strings; the history only needs enough to tell one device
 * from another. Falls back to the raw string when nothing recognisable is in there.
 *
 * Order matters both times: Edge and Chrome both claim to be Safari, and Edge also claims to
 * be Chrome, so the most specific name has to be tested first.
 */
export function shortDevice(userAgent: string | null): string {
  if (!userAgent) return "Unknown device"
  const os = match(userAgent, [
    [/iPhone/, "iPhone"],
    [/iPad/, "iPad"],
    [/Android/, "Android"],
    [/Mac OS X/, "Mac"],
    [/Windows/, "Windows"],
    [/Linux/, "Linux"],
  ])
  const browser = match(userAgent, [
    [/Edg\//, "Edge"],
    [/Firefox\//, "Firefox"],
    [/Chrome\//, "Chrome"],
    [/Safari\//, "Safari"],
  ])
  if (os && browser) return `${browser} on ${os}`
  return os ?? browser ?? userAgent.slice(0, 40)
}

function match(value: string, patterns: [RegExp, string][]): string | null {
  return patterns.find(([pattern]) => pattern.test(value))?.[1] ?? null
}
