import {
  FastForwardIcon,
  LocateFixedIcon,
  PauseIcon,
  PlayIcon,
  SkipBackIcon,
  SkipForwardIcon,
  XIcon,
} from "lucide-react"
import { useEffect, useRef } from "react"

import { MapPanel } from "~/components/map-panel"
import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { Slider } from "~/components/ui/slider"
import { Toggle } from "~/components/ui/toggle"
import { duration, monthDay, shortDate, time } from "~/lib/format"
import { type Clock, type Quiet, quietAt, reportsPassed } from "~/lib/playback"

import { type Playback, SPEEDS, type Speed } from "../hooks/use-playback"

/** Map pixels the bar covers at the bottom, for whatever keeps the marker in view above it. */
export const PLAYBACK_BAR_INSET = 128

type Props = { clock: Clock; player: Playback }

/**
 * The player docked along the bottom of the map: play, step between reports, scrub, speed.
 * Space plays and pauses; the arrow keys step between reports.
 */
export function PlaybackBar({ clock, player }: Props) {
  const { at, playing, playable } = player
  const iso = new Date(at).toISOString()
  const quiet = quietAt(clock, at)
  const span = clock.end - clock.start
  const marks = scrubberMarks(clock)
  const oneDay =
    new Date(clock.start).toDateString() === new Date(clock.end).toDateString()
  const edge = (t: number) => {
    const s = new Date(t).toISOString()
    return oneDay ? time(s) : `${monthDay(s)}, ${time(s)}`
  }

  // Latest player for the key handler, without re-binding it on every frame.
  const latest = useRef(player)
  useEffect(() => {
    latest.current = player
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isInteractive(e.target)) return
      // The focused map pans with the arrow keys.
      if (e.key.startsWith("Arrow") && e.target instanceof HTMLCanvasElement)
        return
      const p = latest.current
      if (e.key === " ") p.toggle()
      else if (e.key === "ArrowLeft") p.step(-1)
      else if (e.key === "ArrowRight") p.step(1)
      else if (e.key === "Escape") p.close()
      else return
      e.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-3 z-20 flex justify-center">
      <MapPanel className="w-full max-w-xl flex-col items-stretch gap-1.5 p-2">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Previous report"
            title="Previous report (←)"
            disabled={!playable}
            onClick={() => player.step(-1)}
          >
            <SkipBackIcon />
          </Button>
          <Button
            size="icon"
            aria-label={playing ? "Pause" : "Play"}
            title={playing ? "Pause (space)" : "Play (space)"}
            disabled={!playable}
            onClick={player.toggle}
          >
            {playing ? <PauseIcon /> : <PlayIcon />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Next report"
            title="Next report (→)"
            disabled={!playable}
            onClick={() => player.step(1)}
          >
            <SkipForwardIcon />
          </Button>
          <div className="min-w-0 flex-1 px-1.5">
            <p className="truncate text-sm font-medium tabular-nums">
              {playable ? time(iso) : "Nothing to play"}
              {playable && (
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  {shortDate(iso)}
                </span>
              )}
            </p>
            <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
              {!playable ? (
                "This range needs at least two reports."
              ) : quiet ? (
                <>
                  <FastForwardIcon className="size-3 shrink-0" />
                  <span className="truncate">{quietLabel(quiet)}</span>
                </>
              ) : (
                <span className="tabular-nums">
                  Report {reportsPassed(clock, at).toLocaleString()} of{" "}
                  {clock.reports.length.toLocaleString()}
                </span>
              )}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="tabular-nums"
                aria-label={`Speed, ${player.speed}×`}
              >
                {player.speed}×
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top">
              <DropdownMenuLabel>Speed</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={String(player.speed)}
                onValueChange={(v) => player.setSpeed(Number(v) as Speed)}
              >
                {SPEEDS.map((s) => (
                  <DropdownMenuRadioItem key={s} value={String(s)}>
                    {s}×{s === 1 && " (normal)"}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Toggle
            size="sm"
            pressed={player.follow}
            onPressedChange={player.setFollow}
            aria-label="Follow the item"
            title="Follow the item"
          >
            <LocateFixedIcon />
          </Toggle>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close the player"
            title="Close (Esc)"
            onClick={player.close}
          >
            <XIcon />
          </Button>
        </div>
        {playable && (
          <div
            role="group"
            aria-label="Playback position"
            className="flex flex-col gap-1 px-1"
          >
            <Slider
              min={clock.start}
              max={clock.end}
              // About a thousand positions across, whatever the range's length.
              step={Math.max(1_000, Math.round(span / 1_000))}
              value={[at]}
              onValueChange={([v]) => player.scrub(v)}
              onValueCommit={player.endScrub}
            />
            {/* Where the reports are (ticks), and the quiet stretches fast-forwarded (bands). */}
            <svg
              className="h-1.5 w-full"
              viewBox="0 0 1000 6"
              preserveAspectRatio="none"
              aria-hidden
            >
              <path d={marks.bands} className="fill-muted-foreground/25" />
              <path
                d={marks.ticks}
                className="stroke-foreground/50"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums">
              <span>{edge(clock.start)}</span>
              <span>{edge(clock.end)}</span>
            </div>
          </div>
        )}
      </MapPanel>
    </div>
  )
}

function quietLabel(quiet: Quiet): string {
  const length = duration((quiet.to - quiet.from) / 1000)
  if (quiet.kind === "stay") return `Stayed put for ${length}`
  if (quiet.kind === "gap") return `No reports for ${length}`
  return `Quiet for ${length}`
}

/** SVG paths across a 1000-wide strip: a tick per report, a band per quiet stretch. */
function scrubberMarks(clock: Clock): { ticks: string; bands: string } {
  const span = clock.end - clock.start
  if (span <= 0) return { ticks: "", bands: "" }
  const x = (t: number) => (((t - clock.start) / span) * 1000).toFixed(1)
  return {
    ticks: clock.reports.map((r) => `M${x(r)} 0V6`).join(""),
    bands: clock.quiet
      .map((q) => `M${x(q.from)} 0H${x(q.to)}V6H${x(q.from)}Z`)
      .join(""),
  }
}

/** Keys typed into a control belong to it, not to the player. */
function isInteractive(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.closest(
        "input, textarea, select, button, a, [role=slider], [role=menu], [role=menuitem], [role=dialog]"
      ) !== null)
  )
}
