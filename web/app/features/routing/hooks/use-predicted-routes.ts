import { useEffect, useRef, useState } from "react"

import { ApiError } from "~/lib/api/client"
import { type PredictedRoutes, tripKey } from "~/lib/predicted-routes"

import { type RouteFilters, getRoutesJob, startRoutes } from "../api/routing"

/** While trips are being matched, the page asks what's new this often. */
export const POLL_MS = 750
/** Asks that fail in a row before the page gives up. */
const MAX_FAILURES = 3

const NONE: ReadonlySet<string> = new Set()

type Answer = {
  promise: Promise<PredictedRoutes>
  key: string
  routes: PredictedRoutes
  fresh: ReadonlySet<string>
}

/**
 * A history view's predicted routes: the loader's answer (`promise`, which never rejects), then,
 * while trips are still being matched, each one as it is. `fresh` holds the `tripKey`s of the
 * trips that arrived that way, to be drawn in. A new promise for the same `key` (the same view
 * loading again) keeps the last answer until its own arrives; a new key starts empty.
 */
export function usePredictedRoutes(
  promise: Promise<PredictedRoutes> | null,
  filters: RouteFilters,
  key: string
) {
  const [answer, setAnswer] = useState<Answer | null>(null)
  const latest = useRef(filters)
  useEffect(() => {
    latest.current = filters
  })

  useEffect(() => {
    if (!promise) return
    let live = true
    void follow({
      first: promise,
      live: () => live,
      show: (routes, fresh) => {
        if (live) setAnswer({ promise, key, routes, fresh })
      },
      restart: () => startRoutes(latest.current),
    })
    return () => {
      live = false
    }
  }, [promise, key])

  const current = promise && answer?.key === key ? answer : null
  return {
    routes: current?.routes,
    fresh: current?.fresh ?? NONE,
    loading: promise !== null && answer?.promise !== promise,
  }
}

async function follow({
  first,
  live,
  show,
  restart,
}: {
  first: Promise<PredictedRoutes>
  live: () => boolean
  show: (routes: PredictedRoutes, fresh: ReadonlySet<string>) => void
  restart: () => Promise<PredictedRoutes>
}) {
  let routes = await first
  let fresh: ReadonlySet<string> = NONE
  show(routes, fresh)
  let failures = 0
  while (live() && routes.progress) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
    if (!live()) return
    const { job, received } = routes.progress
    let next: PredictedRoutes | null
    try {
      next = await getRoutesJob(job, received)
      failures = 0
    } catch (e) {
      if (++failures < MAX_FAILURES) continue
      routes = {
        state: "unavailable",
        message:
          e instanceof ApiError
            ? e.message
            : "Lost touch with the server while finding the predicted routes.",
        trips: [],
        progress: null,
      }
      show(routes, fresh)
      return
    }
    if (next === null) {
      // The server dropped the job (the page slept a while). What it matched is cached.
      routes = await restart()
    } else if (next.state !== "ok") {
      routes = next
    } else {
      fresh = new Set([...fresh, ...next.trips.map(tripKey)])
      routes = {
        ...routes,
        trips: [...routes.trips, ...next.trips],
        progress: next.progress,
      }
    }
    show(routes, fresh)
  }
}
