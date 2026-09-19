import { ApiError, api, unwrap } from "~/lib/api/client"

export async function login(password: string) {
  await unwrap(api.POST("/api/auth/login", { body: { password } }))
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
