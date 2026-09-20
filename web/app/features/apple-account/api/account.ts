import { api, unwrap } from "~/lib/api/client"

export function getAccount() {
  return unwrap(api.GET("/api/apple/account"))
}

/** `purge` also deletes every beacon and its whole history. */
export function signOutOfApple({ purge = false }: { purge?: boolean } = {}) {
  return unwrap(
    api.DELETE("/api/apple/account", { params: { query: { purge } } })
  )
}
