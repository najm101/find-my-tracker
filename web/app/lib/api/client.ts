import createClient from "openapi-fetch"

import type { components, paths } from "./schema"

export type Schemas = components["schemas"]

/** Typed client for the Find My Tracker API. Same origin; the session cookie rides along. */
export const api = createClient<paths>({
  baseUrl: "",
  credentials: "same-origin",
})

/** An API failure with a message that is safe to show to the user as-is. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
  }

  get isUnauthenticated() {
    return this.status === 401
  }
}

type Result<T> = { data?: T; error?: unknown; response: Response }

/** Resolve an openapi-fetch call to its data, or throw an `ApiError`. */
export async function unwrap<T>(call: Promise<Result<T>>): Promise<T> {
  let result: Result<T>
  try {
    result = await call
  } catch {
    throw new ApiError(0, "network", "Can't reach the server. Is it running?")
  }
  const { data, error, response } = result
  if (response.ok) return data as T
  throw toApiError(response.status, error)
}

function toApiError(status: number, body: unknown): ApiError {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>
    const err = b.error as { code?: string; message?: string } | undefined
    if (err?.message)
      return new ApiError(status, err.code ?? "error", err.message)
    // FastAPI validation errors: { detail: [{ msg, loc }] }
    if (Array.isArray(b.detail) && b.detail[0]?.msg) {
      return new ApiError(status, "invalid", String(b.detail[0].msg))
    }
  }
  return new ApiError(status, "error", `Request failed (${status}).`)
}
