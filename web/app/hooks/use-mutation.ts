import { useState } from "react"
import { useRevalidator } from "react-router"
import { toast } from "sonner"

import { ApiError } from "~/lib/api/client"

/**
 * Run a write, then reload the page data so every view of it agrees. Domain errors carry a
 * message written for the user, so they are shown as-is.
 */
export function useMutation() {
  const revalidator = useRevalidator()
  const [pending, setPending] = useState(false)

  async function run(action: () => Promise<unknown>, success?: string) {
    setPending(true)
    try {
      await action()
      if (success) toast.success(success)
      await revalidator.revalidate()
      return true
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Something went wrong.")
      return false
    } finally {
      setPending(false)
    }
  }

  return { run, pending }
}
