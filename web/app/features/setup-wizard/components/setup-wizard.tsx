import { CircleAlertIcon } from "lucide-react"
import { useNavigate } from "react-router"
import { useEffect, useRef, useState } from "react"

import { Alert, AlertDescription } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { Separator } from "~/components/ui/separator"
import { Spinner } from "~/components/ui/spinner"
import { ApiError, type Schemas } from "~/lib/api/client"

import {
  cancelSignIn,
  getWizard,
  importBeacons,
  requestCode,
  resumeSignIn,
  startSignIn,
  submitCode,
  unlockKeychain,
} from "../api/wizard"
import { BeaconsStep } from "./beacons-step"
import { CredentialsStep } from "./credentials-step"
import { DeviceStep } from "./device-step"
import { DoneStep } from "./done-step"
import { RiskNotice } from "./risk-notice"
import { StepIndicator } from "./step-indicator"
import { TwoFactorCodeStep } from "./two-factor-code-step"
import { TwoFactorMethodStep } from "./two-factor-method-step"

type View = Schemas["WizardView"]

const COPY: Record<
  View["step"] | "risk",
  { title: string; description: string; index: number }
> = {
  risk: {
    title: "Connect your Apple account",
    description:
      "Find My Tracker reads your beacons from iCloud, then checks on them.",
    index: 0,
  },
  credentials: {
    title: "Sign in to Apple",
    description: "Use the Apple ID that owns your AirTags and devices.",
    index: 1,
  },
  two_factor_method: {
    title: "Two-factor authentication",
    description: "Apple needs to confirm it's you.",
    index: 2,
  },
  two_factor_code: {
    title: "Enter the code",
    description: "Check your trusted device or messages.",
    index: 2,
  },
  device: {
    title: "Unlock iCloud Keychain",
    description: "Your beacon keys are stored in iCloud Keychain.",
    index: 3,
  },
  beacons: {
    title: "Choose what to track",
    description: "You can change this later.",
    index: 4,
  },
  done: { title: "All done", description: "", index: 5 },
}

// Titles when adding to an already-connected account.
const ADD_COPY: Partial<
  Record<View["step"], { title: string; description: string }>
> = {
  device: {
    title: "Unlock iCloud Keychain",
    description:
      "Enter a device passcode to read your items. It's remembered, so next time this step is skipped.",
  },
  beacons: {
    title: "Add items",
    description:
      "Everything on your Apple account. Tick the new ones to start tracking them.",
  },
}

type Props = {
  initialView: View
  reauth: boolean
  appleId?: string | null
  /** Connected already: skip sign-in and go straight to the item list. */
  autoAdd: boolean
  /** How this server appears in the Apple account's device list. */
  deviceSerial?: string | null
}

export function SetupWizard({
  initialView,
  reauth,
  appleId,
  autoAdd,
  deviceSerial,
}: Props) {
  const [view, setView] = useState(initialView)
  const navigate = useNavigate()
  const [resuming, setResuming] = useState(
    autoAdd && initialView.step === "credentials"
  )
  const resumeStarted = useRef(false)
  // Skip the notice when resuming a flow already under way or signing in again.
  const [riskAccepted, setRiskAccepted] = useState(
    initialView.step !== "credentials" || reauth
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Bumped on every failure so the current step's inputs remount empty.
  const [failures, setFailures] = useState(0)
  const errorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (error)
      errorRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [error, failures])

  async function run(action: () => Promise<View>) {
    setBusy(true)
    setError(null)
    try {
      setView(await action())
    } catch (e) {
      const err =
        e instanceof ApiError
          ? e
          : new ApiError(0, "unknown", "Something went wrong.")
      setError(err.message)
      setFailures((n) => n + 1)
      // The server may have moved on (attempt counts, expiry): re-read where it is.
      if (err.code !== "network") {
        setView(await getWizard().catch(() => view))
      }
    } finally {
      setBusy(false)
    }
  }

  // "Add items": open the saved session instead of asking for a sign-in.
  useEffect(() => {
    if (!resuming || resumeStarted.current) return
    resumeStarted.current = true
    resumeSignIn()
      .then(setView)
      .catch((e) => {
        // Session gone: fall back to a full sign-in, explaining why.
        setRiskAccepted(true)
        setError(
          e instanceof ApiError
            ? e.message
            : "Couldn't open your Apple account."
        )
      })
      .finally(() => setResuming(false))
  }, [resuming])

  async function startOver() {
    setBusy(true)
    setError(null)
    await cancelSignIn().catch(() => undefined)
    setView(await getWizard())
    setBusy(false)
  }

  const adding = view.mode === "add"
  const stepKey = riskAccepted || adding ? view.step : "risk"
  const copy = {
    ...COPY[stepKey],
    ...(adding && stepKey !== "risk" ? ADD_COPY[stepKey] : {}),
  }
  const canStartOver = !adding && !["credentials", "done"].includes(view.step)

  if (resuming) {
    return (
      <Card className="w-full max-w-lg">
        <CardContent className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
          <Spinner />
          Reading the items on your Apple account…
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>
          {reauth && stepKey === "credentials" ? "Sign in again" : copy.title}
        </CardTitle>
        {copy.description && (
          <CardDescription>
            {reauth && stepKey === "credentials"
              ? "Apple ended the saved session. Sign in to resume tracking; your history is kept."
              : copy.description}
          </CardDescription>
        )}
        {adding && view.step !== "done" && (
          <CardAction>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={async () => {
                await cancelSignIn().catch(() => undefined)
                navigate("/")
              }}
            >
              Cancel
            </Button>
          </CardAction>
        )}
        {canStartOver && (
          <CardAction>
            <Button
              variant="ghost"
              size="sm"
              onClick={startOver}
              disabled={busy}
            >
              Start over
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {stepKey !== "done" && !adding && (
          <>
            <StepIndicator current={copy.index} />
            <Separator />
          </>
        )}

        {error && (
          <Alert variant="destructive" ref={errorRef}>
            <CircleAlertIcon />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {stepKey === "risk" && (
          <RiskNotice
            onAccept={() => setRiskAccepted(true)}
            deviceSerial={deviceSerial}
          />
        )}

        {stepKey === "credentials" && (
          <CredentialsStep
            busy={busy}
            defaultAppleId={appleId}
            onSubmit={(id, pw) => run(() => startSignIn(id, pw))}
          />
        )}

        {stepKey === "two_factor_method" && (
          <TwoFactorMethodStep
            busy={busy}
            methods={view.methods ?? []}
            onSubmit={(id) => run(() => requestCode(id))}
          />
        )}

        {stepKey === "two_factor_code" && (
          <TwoFactorCodeStep
            key={failures}
            busy={busy}
            onSubmit={(code) => run(() => submitCode(code))}
            onResend={() => run(() => requestCode(view.chosen_method_id ?? 0))}
          />
        )}

        {stepKey === "device" && (
          <DeviceStep
            busy={busy}
            resetKey={failures}
            devices={view.devices ?? []}
            attemptsLeft={view.passcode_attempts_left}
            onSubmit={(deviceId, passcode) =>
              run(() => unlockKeychain(deviceId, passcode))
            }
          />
        )}

        {stepKey === "beacons" && (
          <BeaconsStep
            busy={busy}
            adding={adding}
            beacons={view.beacons ?? []}
            onSubmit={(ids, minutes) => run(() => importBeacons(ids, minutes))}
          />
        )}

        {stepKey === "done" && (
          <DoneStep
            count={view.imported_count ?? 0}
            adding={adding}
            deviceSerial={deviceSerial}
          />
        )}
      </CardContent>
    </Card>
  )
}
