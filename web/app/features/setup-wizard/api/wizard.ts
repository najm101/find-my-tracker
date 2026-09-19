import { api, unwrap } from "~/lib/api/client"

export function getWizard() {
  return unwrap(api.GET("/api/apple/wizard"))
}

export function startSignIn(appleId: string, password: string) {
  return unwrap(
    api.POST("/api/apple/wizard/start", {
      body: { apple_id: appleId, password },
    })
  )
}

export function requestCode(methodId: number) {
  return unwrap(
    api.POST("/api/apple/wizard/2fa/request", { body: { method_id: methodId } })
  )
}

export function submitCode(code: string) {
  return unwrap(api.POST("/api/apple/wizard/2fa/submit", { body: { code } }))
}

export function unlockKeychain(deviceId: string, passcode: string) {
  return unwrap(
    api.POST("/api/apple/wizard/unlock", {
      body: { device_id: deviceId, passcode },
    })
  )
}

export function importBeacons(
  identifiers: string[],
  pollIntervalMinutes: number | null
) {
  return unwrap(
    api.POST("/api/apple/wizard/import", {
      body: { identifiers, poll_interval_minutes: pollIntervalMinutes },
    })
  )
}

export function cancelSignIn() {
  return unwrap(api.DELETE("/api/apple/wizard"))
}

/** Add beacons with the saved Apple session: no Apple ID or 2FA, and usually no passcode. */
export function resumeSignIn() {
  return unwrap(api.POST("/api/apple/wizard/resume"))
}
