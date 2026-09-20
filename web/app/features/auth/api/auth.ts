import { ApiError, api, type Schemas, unwrap } from "~/lib/api/client"

/**
 * Step one of signing in. When it resolves to `mfa_required`, the password was right but the
 * server is holding a short-lived ticket and wants an authenticator code from `submitMfa`.
 */
export async function login(password: string) {
  return unwrap(api.POST("/api/auth/login", { body: { password } }))
}

/** Step two: a six-digit authenticator code, or one recovery code. */
export async function submitMfa(code: string) {
  await unwrap(api.POST("/api/auth/mfa", { body: { code } }))
}

export async function logout() {
  await unwrap(api.POST("/api/auth/logout"))
}

/** True when the dashboard session cookie is valid. */
export async function isAuthenticated(): Promise<boolean> {
  try {
    await unwrap(api.GET("/api/auth/me"))
    return true
  } catch (e) {
    if (e instanceof ApiError && e.isUnauthenticated) return false
    throw e
  }
}

// ---- managing the account ----

export async function getSecurity(): Promise<Schemas["SecurityStatus"]> {
  return unwrap(api.GET("/api/auth/security"))
}

export async function changePassword(
  currentPassword: string,
  newPassword: string
) {
  await unwrap(
    api.POST("/api/auth/password", {
      body: { current_password: currentPassword, new_password: newPassword },
    })
  )
}

/** Log every browser out, including this one. */
export async function revokeSessions() {
  await unwrap(api.POST("/api/auth/sessions/revoke"))
}

// ---- the second factor (optional) ----

/** Mint a secret to scan. It does nothing until `confirmTotp` proves the app received it. */
export async function startTotp(): Promise<Schemas["TotpSetup"]> {
  return unwrap(api.POST("/api/auth/totp/setup"))
}

/** Confirm the app is set up, and receive the recovery codes. They are shown only once. */
export async function confirmTotp(
  code: string
): Promise<Schemas["RecoveryCodes"]> {
  return unwrap(api.POST("/api/auth/totp/confirm", { body: { code } }))
}

export async function disableTotp(password: string) {
  await unwrap(api.POST("/api/auth/totp/disable", { body: { password } }))
}

export async function regenerateRecoveryCodes(
  password: string
): Promise<Schemas["RecoveryCodes"]> {
  return unwrap(api.POST("/api/auth/recovery-codes", { body: { password } }))
}
