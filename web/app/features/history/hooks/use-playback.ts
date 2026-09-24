import { useEffect, useState } from "react"

import { type Clock, advance, stepReport } from "~/lib/playback"

export const SPEEDS = [0.5, 1, 2, 4] as const
export type Speed = (typeof SPEEDS)[number]

/** A hidden tab gets no frames; don't leap ahead when it comes back. */
const MAX_FRAME_MS = 100

export type Playback = ReturnType<typeof usePlayback>

/**
 * The player for a history range: whether it's open and playing, and where it is (`at`, epoch
 * ms, always inside the clock). `rangeKey` names the range; a new one rewinds and pauses.
 */
export function usePlayback(clock: Clock, rangeKey: string) {
  const [open, setOpen] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [scrubbing, setScrubbing] = useState(false)
  const [rawAt, setAt] = useState(Number.NEGATIVE_INFINITY)
  const [speed, setSpeed] = useState<Speed>(1)
  const [follow, setFollow] = useState(false)
  const [range, setRange] = useState(rangeKey)

  if (range !== rangeKey) {
    setRange(rangeKey)
    setPlaying(false)
    setAt(Number.NEGATIVE_INFINITY)
  }

  const playable = clock.duration > 0
  const at = Math.min(clock.end, Math.max(clock.start, rawAt))

  // Played to the end (or the data went): stop there.
  if (playing && (!playable || at >= clock.end)) setPlaying(false)

  useEffect(() => {
    if (!playing || scrubbing) return
    let last = performance.now()
    let frame = requestAnimationFrame(function tick(now) {
      const elapsed = Math.min(now - last, MAX_FRAME_MS)
      last = now
      setAt((prev) => advance(clock, prev, elapsed * speed))
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [playing, scrubbing, speed, clock])

  // Separate functions rather than methods on the returned object: `at` changes every frame,
  // and only the ones that read it should change with it (the compiler memoizes each).

  /** Open the player and play; from the start again once it has reached the end. */
  function play() {
    setOpen(true)
    if (!playable) return
    setAt((prev) => (prev >= clock.end ? clock.start : prev))
    setPlaying(true)
  }

  function toggle() {
    if (playing) setPlaying(false)
    else play()
  }

  function close() {
    setOpen(false)
    setPlaying(false)
  }

  /** Jump to a time, e.g. a report picked in the timeline. Keeps playing if it was. */
  function seek(to: number) {
    setAt(to)
  }

  /** Dragging the scrubber: playback holds still under the finger until it lets go. */
  function scrub(to: number) {
    setScrubbing(true)
    setAt(to)
  }

  function endScrub() {
    setScrubbing(false)
  }

  /** To the next (1) or previous (-1) report, paused there. */
  function step(direction: -1 | 1) {
    setPlaying(false)
    setAt(stepReport(clock, at, direction))
  }

  return {
    open,
    playing,
    playable,
    at,
    speed,
    follow,
    play,
    toggle,
    close,
    seek,
    scrub,
    endScrub,
    step,
    setSpeed,
    setFollow,
  }
}
