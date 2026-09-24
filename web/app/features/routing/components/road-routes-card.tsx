import {
  CircleAlertIcon,
  ExternalLinkIcon,
  MapIcon,
  RefreshCwIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useRevalidator } from "react-router"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "~/components/ui/item"
import { Progress } from "~/components/ui/progress"
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group"
import { Spinner } from "~/components/ui/spinner"
import { Switch } from "~/components/ui/switch"
import { useMutation } from "~/hooks/use-mutation"
import type { Schemas } from "~/lib/api/client"
import { bytes, timeAgo } from "~/lib/format"

import {
  addRegion,
  deleteMapData,
  refreshRegions,
  removeRegion,
  setAutoDownload,
  updateRouting,
} from "../api/routing"
import { ROUTING_GUIDE, isBusy, regionStatus } from "../labels"
import { RegionPicker } from "./region-picker"

type Status = Schemas["RoutingStatus"]
type Mode = Schemas["RoutingMode"]

const MODES: { value: Mode; title: string; description: string }[] = [
  {
    value: "off",
    title: "Off",
    description: "History shows only what the items reported.",
  },
  {
    value: "builtin",
    title: "Built in",
    description:
      "This server downloads map data for where your items go and does the routing itself. Needs about 2 GB of memory while it prepares a country.",
  },
  {
    value: "external",
    title: "Another Valhalla server",
    description:
      "A Valhalla routing server you run yourself, in another container or elsewhere on your network.",
  },
]

/**
 * Road routes: snapping history to the roads it most likely took. Off, done by this server on map
 * data it downloads, or by a Valhalla server elsewhere.
 */
export function RoadRoutesCard({
  routing,
  now,
}: {
  routing: Status
  now: number
}) {
  const busy = isBusy(routing.builtin)
  useRefreshWhile(busy)

  return (
    <Card id="road-routes">
      <CardHeader>
        <CardTitle>Road routes</CardTitle>
        <CardDescription>
          Show the roads an item most likely took between its reports, not just
          straight lines. It is a best guess: reports are where a passing phone
          was, so they scatter.{" "}
          <a
            href={ROUTING_GUIDE}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 underline underline-offset-4"
          >
            How it works
            <ExternalLinkIcon className="size-3" />
          </a>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {routing.configured_by_env ? (
          <ExternalServer routing={routing} fixed />
        ) : (
          <ModeChoice routing={routing} />
        )}
        {routing.mode === "builtin" && routing.builtin && (
          <BuiltinEngine
            routing={routing}
            builtin={routing.builtin}
            now={now}
          />
        )}
      </CardContent>
    </Card>
  )
}

function ModeChoice({ routing }: { routing: Status }) {
  const { run, pending } = useMutation()
  const [choice, setChoice] = useState<Mode>(routing.mode)
  const [url, setUrl] = useState(routing.external?.url ?? "")

  function choose(mode: Mode) {
    setChoice(mode)
    // The external server needs an address first; the others take effect now.
    if (mode !== "external")
      void run(
        () => updateRouting({ mode }),
        mode === "off" ? "Road routes are off." : "Using the built-in engine."
      )
  }

  return (
    <div className="flex flex-col gap-4">
      <RadioGroup
        value={choice}
        onValueChange={(v) => choose(v as Mode)}
        disabled={pending}
      >
        {MODES.map((m) => (
          <FieldLabel key={m.value} htmlFor={`routing-${m.value}`}>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>{m.title}</FieldTitle>
                <FieldDescription>{m.description}</FieldDescription>
              </FieldContent>
              <RadioGroupItem value={m.value} id={`routing-${m.value}`} />
            </Field>
          </FieldLabel>
        ))}
      </RadioGroup>

      {choice === "external" && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            void run(
              () => updateRouting({ mode: "external", url }),
              "Connected to the routing server."
            )
          }}
        >
          <Field>
            <FieldLabel htmlFor="routing-url">Server address</FieldLabel>
            <div className="flex gap-2">
              <Input
                id="routing-url"
                value={url}
                placeholder="http://valhalla:8002"
                autoComplete="off"
                inputMode="url"
                onChange={(e) => setUrl(e.target.value)}
              />
              <Button type="submit" disabled={pending || !url.trim()}>
                {pending && <Spinner />}
                Connect
              </Button>
            </div>
            <FieldDescription>
              In the same Docker network, the container&apos;s name works, for
              example <code>http://valhalla:8002</code>.
            </FieldDescription>
          </Field>
        </form>
      )}
      {routing.mode === "external" && routing.external && (
        <ExternalServer routing={routing} />
      )}
    </div>
  )
}

function ExternalServer({
  routing,
  fixed = false,
}: {
  routing: Status
  fixed?: boolean
}) {
  const external = routing.external
  if (!external) return null
  return (
    <Item variant="outline">
      <ItemContent>
        <ItemTitle>
          Valhalla at <code className="break-all">{external.url}</code>
          {external.reachable ? (
            <Badge variant="secondary">Connected</Badge>
          ) : (
            <Badge variant="destructive">Unreachable</Badge>
          )}
        </ItemTitle>
        <ItemDescription className="line-clamp-none">
          {external.reachable
            ? `Valhalla ${external.version}.`
            : external.error}{" "}
          {fixed &&
            "Set by this server's ROUTING_URL, so it can't be changed here. "}
          Its map data is managed where it runs. For items whose reports are far
          apart, it needs <code>meili.default.breakage_distance</code> raised;
          see{" "}
          <a
            href={ROUTING_GUIDE}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-4"
          >
            the guide
          </a>
          .
        </ItemDescription>
      </ItemContent>
    </Item>
  )
}

function BuiltinEngine({
  routing,
  builtin,
  now,
}: {
  routing: Status
  builtin: Schemas["BuiltinOut"]
  now: number
}) {
  const { run, pending } = useMutation()
  const have = new Set(builtin.regions.map((r) => r.id))

  return (
    <div className="flex flex-col gap-4">
      <EngineState builtin={builtin} message={routing.message} now={now} />

      {builtin.error && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>The routing engine has a problem</AlertTitle>
          <AlertDescription>{builtin.error}</AlertDescription>
        </Alert>
      )}

      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel htmlFor="routing-auto">
            Download map data automatically
          </FieldLabel>
          <FieldDescription>
            When an item&apos;s history reaches a country (or state) without map
            data, download it. Anything over 1.5 GB waits for you.
          </FieldDescription>
        </FieldContent>
        <Switch
          id="routing-auto"
          checked={builtin.auto_download}
          disabled={pending}
          onCheckedChange={(on) => run(() => setAutoDownload(on))}
        />
      </Field>

      {routing.missing_regions.length > 0 && (
        <Alert>
          <MapIcon />
          <AlertTitle>Map data missing</AlertTitle>
          <AlertDescription>
            <ItemGroup className="w-full gap-2">
              {routing.missing_regions.map((r) => (
                <Item key={r.id} size="sm" className="px-0">
                  <ItemContent>
                    <ItemTitle>{r.name}</ItemTitle>
                    <ItemDescription>
                      Recent history of {r.beacons.join(", ")} is there.
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() =>
                        run(() => addRegion(r.id), `Downloading ${r.name}.`)
                      }
                    >
                      Download
                    </Button>
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          </AlertDescription>
        </Alert>
      )}

      {builtin.regions.length > 0 && (
        <ItemGroup className="gap-2">
          {builtin.regions.map((r) => (
            <Item key={r.id} variant="outline" size="sm">
              <ItemContent>
                <ItemTitle>
                  {r.name}
                  {r.auto && <Badge variant="outline">Automatic</Badge>}
                </ItemTitle>
                <ItemDescription>{regionStatus(r)}</ItemDescription>
                {r.status === "downloading" && r.progress != null && (
                  <Progress value={r.progress * 100} className="mt-1" />
                )}
              </ItemContent>
              <ItemActions>
                {(r.status === "too_large" || r.status === "failed") && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      run(() => addRegion(r.id), `Downloading ${r.name}.`)
                    }
                  >
                    {r.status === "failed" ? "Try again" : "Download"}
                  </Button>
                )}
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Remove ${r.name}`}
                  title="Remove"
                  disabled={pending}
                  onClick={() =>
                    run(() => removeRegion(r.id), `${r.name} removed.`)
                  }
                >
                  <XIcon />
                </Button>
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <RegionPicker
          have={have}
          disabled={pending}
          onPick={(r) => run(() => addRegion(r.id), `Downloading ${r.name}.`)}
        />
        {builtin.regions.length > 0 && (
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={pending || isBusy(builtin)}
              onClick={() =>
                run(() => refreshRegions(), "Updating the map data.")
              }
            >
              <RefreshCwIcon />
              Update maps
            </Button>
            <DeleteMapData
              pending={pending}
              onConfirm={() => run(deleteMapData, "Map data deleted.")}
            />
          </>
        )}
        {builtin.disk_bytes > 0 && (
          <span className="text-xs text-muted-foreground">
            Map data uses {bytes(builtin.disk_bytes)}.
          </span>
        )}
      </div>
    </div>
  )
}

function EngineState({
  builtin,
  message,
  now,
}: {
  builtin: Schemas["BuiltinOut"]
  message: string | null
  now: number
}) {
  if (builtin.phase === "building" || builtin.phase === "starting") {
    return (
      <p className="flex items-center gap-2 text-sm">
        <Spinner />
        {builtin.phase === "building"
          ? `Preparing the road data${builtin.detail ? `: ${builtin.detail.toLowerCase()}` : ""}. A country takes a few minutes.`
          : "Starting the routing engine."}
      </p>
    )
  }
  if (builtin.phase === "downloading") {
    return (
      <p className="flex items-center gap-2 text-sm">
        <Spinner />
        Downloading {builtin.detail}
        {builtin.progress != null &&
          ` · ${Math.round(builtin.progress * 100)}%`}
      </p>
    )
  }
  if (builtin.serving) {
    return (
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="secondary">Ready</Badge>
        {builtin.built_at &&
          `Road data prepared ${timeAgo(builtin.built_at, now)}.`}
      </p>
    )
  }
  return <p className="text-sm text-muted-foreground">{message}</p>
}

function DeleteMapData({
  pending,
  onConfirm,
}: {
  pending: boolean
  onConfirm: () => void
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" disabled={pending}>
          <Trash2Icon />
          Delete map data
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete all map data?</AlertDialogTitle>
          <AlertDialogDescription>
            Every downloaded region and the road data built from them. Road
            routes stop until map data is downloaded again. Your items&apos;
            history is not touched.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** Reload the page's data every few seconds while downloads or a build are under way. */
function useRefreshWhile(active: boolean) {
  const revalidator = useRevalidator()
  // `revalidator` changes on every state change; hold the function still so the timer doesn't
  // restart each time a reload begins or ends.
  const revalidate = useRef(revalidator.revalidate)
  useEffect(() => {
    revalidate.current = revalidator.revalidate
  })
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => void revalidate.current(), 2_000)
    return () => clearInterval(id)
  }, [active])
}
