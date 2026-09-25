import { useState } from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { Field, FieldDescription, FieldLabel } from "~/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { useMutation } from "~/hooks/use-mutation"
import { useRefreshWhile } from "~/hooks/use-refresh-while"
import { ApiError, type Schemas } from "~/lib/api/client"
import { date, timeAgo } from "~/lib/format"

import { previewRetention, setRetention } from "../api/retention"
import {
  RETENTION_CHOICES,
  mayDelete,
  retentionLabel as label,
} from "../retention"

const FOREVER = "forever"

function count(n: number, one: string, many: string): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`
}

type Props = {
  retention: Schemas["RetentionStatus"]
  now: number
  /** A download of every sighting from before `before`, to keep a copy of what's deleted. */
  exportHref: (format: "csv" | "geojson", before: string) => string
}

/**
 * How long location history is kept. A shorter period says what it will delete before it does;
 * a longer one only changes what's deleted from then on.
 */
export function RetentionCard({ retention, now, exportHref }: Props) {
  const { run, pending } = useMutation()
  const [checking, setChecking] = useState(false)
  const [asking, setAsking] = useState<Schemas["RetentionPreview"] | null>(null)
  const current = retention.days
  useRefreshWhile(retention.running, 1_000)

  function save(days: number | null) {
    return run(
      () => setRetention(days),
      days === null
        ? "History is kept for good."
        : `History is kept for ${label(days)}.`
    )
  }

  async function choose(value: string) {
    const days = value === FOREVER ? null : Number(value)
    if (days === current) return
    // Longer (or for good): nothing is deleted now, and nothing already deleted comes back.
    if (days === null || !mayDelete(current, days)) {
      await save(days)
      return
    }
    setChecking(true)
    try {
      const preview = await previewRetention(days)
      if (preview.sightings === 0) await save(days)
      else setAsking(preview)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Something went wrong.")
    } finally {
      setChecking(false)
    }
  }

  const last = retention.last_run
  return (
    <Card>
      <CardHeader>
        <CardTitle>Keep history</CardTitle>
        <CardDescription>
          Sightings older than this are deleted for good, every hour. Each
          item&apos;s last known position is always kept, so a lost item can
          still be found.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Field>
          <FieldLabel htmlFor="retention">Keep sightings for</FieldLabel>
          <Select
            value={current === null ? FOREVER : String(current)}
            disabled={pending || checking}
            onValueChange={(v) => void choose(v)}
          >
            <SelectTrigger id="retention" className="w-full sm:w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RETENTION_CHOICES.map((c) => (
                <SelectItem
                  key={c.label}
                  value={c.days === null ? FOREVER : String(c.days)}
                >
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>
            {retention.oldest
              ? `The oldest sighting is from ${date(retention.oldest)}.`
              : "No sightings yet."}{" "}
            {retention.running
              ? "Deleting old sightings…"
              : last &&
                `Last cleaned up ${timeAgo(last.at, now)}: ${
                  last.deleted
                    ? `${count(last.deleted, "sighting", "sightings")} deleted.`
                    : "nothing was old enough."
                }`}
          </FieldDescription>
        </Field>
      </CardContent>
      <AlertDialog
        open={asking !== null}
        onOpenChange={(open) => !open && setAsking(null)}
      >
        {asking && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Delete sightings older than {label(asking.days)}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {count(asking.sightings, "sighting", "sightings")} from before{" "}
                {date(asking.cutoff)}, across{" "}
                {count(asking.items, "item", "items")}, will be deleted now.
                From then on, anything older than {label(asking.days)} is
                deleted automatically. Each item&apos;s last known position is
                kept. This can&apos;t be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <p className="text-sm text-muted-foreground">
              Keep a copy first:{" "}
              <a
                href={exportHref("csv", asking.cutoff)}
                download
                className="underline underline-offset-4"
              >
                CSV
              </a>{" "}
              ·{" "}
              <a
                href={exportHref("geojson", asking.cutoff)}
                download
                className="underline underline-offset-4"
              >
                GeoJSON
              </a>
            </p>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => void save(asking.days)}
              >
                Delete and keep {label(asking.days)}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </Card>
  )
}
