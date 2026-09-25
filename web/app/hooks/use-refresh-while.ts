import { useEffect, useRef } from "react"
import { useRevalidator } from "react-router"

/** Reload the page's data every few seconds while something on the server is under way. */
export function useRefreshWhile(active: boolean, everyMs = 2_000) {
  const revalidator = useRevalidator()
  // `revalidator` changes on every state change; hold the function still so the timer doesn't
  // restart each time a reload begins or ends.
  const revalidate = useRef(revalidator.revalidate)
  useEffect(() => {
    revalidate.current = revalidator.revalidate
  })
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => void revalidate.current(), everyMs)
    return () => clearInterval(id)
  }, [active, everyMs])
}
