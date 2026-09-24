import { useEffect, useState } from "react"

type Settled<T> = { promise: Promise<T>; key: string; value: T }

/**
 * What a loader's promise resolves to, for data the page shows without waiting for it. While a
 * new promise for the same `key` is on its way (a revalidation, a redraw of the same view), the
 * last value stays; a new key starts empty. The promise must not reject. Pass null for none.
 */
export function useSettled<T>(promise: Promise<T> | null, key: string) {
  const [settled, setSettled] = useState<Settled<T> | null>(null)
  useEffect(() => {
    if (!promise) return
    let live = true
    void promise.then((value) => {
      if (live) setSettled({ promise, key, value })
    })
    return () => {
      live = false
    }
  }, [promise, key])
  const current = promise && settled?.key === key ? settled : null
  return {
    value: current?.value,
    loading: promise !== null && settled?.promise !== promise,
  }
}
