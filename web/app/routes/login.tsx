import { redirect, useNavigation } from "react-router"

import { isAuthenticated, login, submitMfa } from "~/features/auth/api/auth"
import {
  LoginForm,
  type LoginStage,
} from "~/features/auth/components/login-form"
import { ApiError } from "~/lib/api/client"

import type { Route } from "./+types/login"

export function meta() {
  return [{ title: "Log in · Find My Tracker" }]
}

export async function clientLoader() {
  if (await isAuthenticated()) throw redirect("/")
  return null
}

export async function clientAction({ request }: Route.ClientActionArgs) {
  const form = await request.formData()
  const stage: LoginStage = form.get("intent") === "mfa" ? "mfa" : "password"
  try {
    if (stage === "mfa") {
      await submitMfa(String(form.get("code") ?? ""))
    } else {
      const { mfa_required } = await login(String(form.get("password") ?? ""))
      if (mfa_required) return { stage: "mfa" as LoginStage }
    }
    return redirect("/")
  } catch (e) {
    if (e instanceof ApiError) {
      // The half-finished login timed out, so the password has to be entered again.
      const back = e.code === "mfa_expired"
      return {
        stage: back ? ("password" as LoginStage) : stage,
        error: e.message,
      }
    }
    throw e
  }
}

export default function Login({ actionData }: Route.ComponentProps) {
  const navigation = useNavigation()
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <LoginForm
        stage={actionData?.stage ?? "password"}
        error={actionData?.error}
        pending={navigation.state !== "idle"}
      />
    </main>
  )
}
