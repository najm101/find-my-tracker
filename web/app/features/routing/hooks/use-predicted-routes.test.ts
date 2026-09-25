import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { PredictedRoutes, PredictedTrip } from "~/lib/predicted-routes"

import { getRoutesJob, startRoutes } from "../api/routing"
import { POLL_MS, usePredictedRoutes } from "./use-predicted-routes"

vi.mock("../api/routing", () => ({
  getRoutesJob: vi.fn(),
  startRoutes: vi.fn(),
}))

const FILTERS = { from: new Date(0), to: new Date(1) }

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

function trip(minute: number): PredictedTrip {
  const at = `2026-09-20T08:${String(minute).padStart(2, "0")}:00Z`
  return {
    beacon_id: 1,
    costing: "auto",
    geometry: [],
    reports: [
      {
        observed_at: at,
        latitude: 52,
        longitude: 4,
        offset_m: 0,
        off_route: false,
      },
    ],
    broken_after: [],
    fallback: null,
  }
}

function answer(
  trips: PredictedTrip[],
  progress: PredictedRoutes["progress"] = null
): PredictedRoutes {
  return { state: "ok", message: null, trips, progress }
}

const going = (done: number, received: number) => ({
  job: "job-1",
  done,
  trips_left: 2 - received,
  received,
})

describe("usePredictedRoutes", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.mocked(getRoutesJob).mockReset()
    vi.mocked(startRoutes).mockReset()
  })

  it("is loading until the first answer, then follows the job to the end", async () => {
    const first = deferred<PredictedRoutes>()
    vi.mocked(getRoutesJob)
      .mockResolvedValueOnce(answer([trip(10)], going(0.6, 1)))
      .mockResolvedValueOnce(answer([trip(20)], null))
    const { result } = renderHook(() =>
      usePredictedRoutes(first.promise, FILTERS, "a")
    )
    expect(result.current.loading).toBe(true)
    expect(result.current.routes).toBeUndefined()

    await act(async () => first.resolve(answer([trip(0)], going(0.1, 0))))
    expect(result.current.loading).toBe(false)
    expect(result.current.routes?.progress?.done).toBe(0.1)
    expect(result.current.fresh.size).toBe(0) // the first answer shows as it is

    await act(() => vi.advanceTimersByTimeAsync(POLL_MS))
    expect(getRoutesJob).toHaveBeenLastCalledWith("job-1", 0)
    expect(result.current.routes?.trips).toHaveLength(2)
    expect(result.current.routes?.progress?.done).toBe(0.6)
    expect(result.current.fresh.size).toBe(1)

    await act(() => vi.advanceTimersByTimeAsync(POLL_MS))
    expect(getRoutesJob).toHaveBeenLastCalledWith("job-1", 1)
    expect(result.current.routes?.trips).toHaveLength(3)
    expect(result.current.routes?.progress).toBeNull()
    expect(result.current.fresh.size).toBe(2)

    await act(() => vi.advanceTimersByTimeAsync(POLL_MS * 3))
    expect(getRoutesJob).toHaveBeenCalledTimes(2) // done: no more asking
  })

  it("starts again when the server has dropped the job", async () => {
    vi.mocked(getRoutesJob).mockResolvedValueOnce(null)
    vi.mocked(startRoutes).mockResolvedValueOnce(answer([trip(0), trip(10)]))
    const first = Promise.resolve(answer([], going(0, 0)))
    const { result } = renderHook(() => usePredictedRoutes(first, FILTERS, "a"))
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS))
    expect(startRoutes).toHaveBeenCalledWith(FILTERS)
    expect(result.current.routes?.trips).toHaveLength(2)
    expect(result.current.routes?.progress).toBeNull()
  })

  it("gives up after failing to ask a few times in a row", async () => {
    vi.mocked(getRoutesJob).mockRejectedValue(new Error("offline"))
    const first = Promise.resolve(answer([trip(0)], going(0, 0)))
    const { result } = renderHook(() => usePredictedRoutes(first, FILTERS, "a"))
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS * 2))
    expect(result.current.routes?.state).toBe("ok")
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS))
    expect(result.current.routes?.state).toBe("unavailable")
    expect(result.current.routes?.message).toMatch(/lost touch/i)
  })

  it("keeps the last answer while the same view loads again, not for another", async () => {
    const { result, rerender } = renderHook(
      ({ p, key }) => usePredictedRoutes(p, FILTERS, key),
      {
        initialProps: {
          p: Promise.resolve(answer([trip(0)])),
          key: "a",
        },
      }
    )
    await act(() => vi.advanceTimersByTimeAsync(0))
    const again = deferred<PredictedRoutes>()
    rerender({ p: again.promise, key: "a" })
    expect(result.current.routes?.trips).toHaveLength(1)
    expect(result.current.loading).toBe(true)

    rerender({ p: deferred<PredictedRoutes>().promise, key: "b" })
    expect(result.current.routes).toBeUndefined()

    rerender({ p: null as unknown as Promise<PredictedRoutes>, key: "b" })
    expect(result.current.loading).toBe(false)
  })
})
