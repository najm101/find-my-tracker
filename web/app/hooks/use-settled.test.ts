import { act, renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { useSettled } from "./use-settled"

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

describe("useSettled", () => {
  it("is loading until the promise resolves", async () => {
    const d = deferred<string>()
    const { result } = renderHook(() => useSettled(d.promise, "a"))
    expect(result.current).toEqual({ value: undefined, loading: true })
    await act(async () => d.resolve("roads"))
    expect(result.current).toEqual({ value: "roads", loading: false })
  })

  it("keeps the last value while the same view loads again", async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    const { result, rerender } = renderHook(
      ({ p, key }) => useSettled(p, key),
      { initialProps: { p: first.promise, key: "a" } }
    )
    await act(async () => first.resolve("old"))
    rerender({ p: second.promise, key: "a" })
    expect(result.current).toEqual({ value: "old", loading: true })
    await act(async () => second.resolve("new"))
    expect(result.current).toEqual({ value: "new", loading: false })
  })

  it("drops the last value for another view", async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    const { result, rerender } = renderHook(
      ({ p, key }) => useSettled(p, key),
      { initialProps: { p: first.promise, key: "a" } }
    )
    await act(async () => first.resolve("old"))
    rerender({ p: second.promise, key: "b" })
    expect(result.current).toEqual({ value: undefined, loading: true })
  })

  it("ignores an answer that arrives after a newer promise", async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    const { result, rerender } = renderHook(({ p }) => useSettled(p, "a"), {
      initialProps: { p: first.promise },
    })
    rerender({ p: second.promise })
    await act(async () => first.resolve("stale"))
    expect(result.current.value).toBeUndefined()
    await act(async () => second.resolve("fresh"))
    await waitFor(() => expect(result.current.value).toBe("fresh"))
  })

  it("is idle without a promise", () => {
    const { result } = renderHook(() => useSettled(null, "a"))
    expect(result.current).toEqual({ value: undefined, loading: false })
  })
})
