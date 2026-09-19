import { useState } from "react"
import { useRevalidator } from "react-router"
import { toast } from "sonner"

import { ApiError } from "~/lib/api/client"

import { refreshNow } from "../api/tracking"

/** Ask for a poll now, then reload the page data so the new positions show up. */
export function useRefreshNow() {
  const revalidator = useRevalidator()
  const [refreshing, setRefreshing] = useState(false)

  async function refresh() {
    setRefreshing(true)
    try {
      await refreshNow()
      toast.success("Checking for new locations…")
      await revalidator.revalidate()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Refresh failed.")
    } finally {
      setRefreshing(false)
    }
  }

  return { refresh, refreshing }
}
