import { redirect, useNavigation } from "react-router"

import { isAuthenticated, login } from "~/features/auth/api/auth"
import { LoginForm } from "~/features/auth/components/login-form"
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
  try {
    await login(String(form.get("password") ?? ""))
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message }
    throw e
  }
  return redirect("/")
}

export default function Login({ actionData }: Route.ComponentProps) {
  const navigation = useNavigation()
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <LoginForm
        error={actionData?.error}
        pending={navigation.state !== "idle"}
      />
    </main>
  )
}
