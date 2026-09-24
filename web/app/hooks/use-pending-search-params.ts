import { useLocation, useNavigation, useSearchParams } from "react-router"

/**
 * The search params this page is on its way to, while a navigation within it loads; otherwise
 * the current ones. Lets a control show the choice just made instead of lagging behind it.
 */
export function usePendingSearchParams() {
  const [params] = useSearchParams()
  const here = useLocation()
  const next = useNavigation().location
  return next && next.pathname === here.pathname
    ? new URLSearchParams(next.search)
    : params
}
