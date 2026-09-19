import { api, unwrap } from "~/lib/api/client"

export function getAccount() {
  return unwrap(api.GET("/api/apple/account"))
}

export function signOutOfApple() {
  return unwrap(api.DELETE("/api/apple/account"))
}
