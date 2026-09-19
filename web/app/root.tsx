import { ThemeProvider } from "next-themes"
import {
  Links,
  Meta,
  Navigate,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
} from "react-router"

import { Toaster } from "~/components/ui/sonner"
import { Spinner } from "~/components/ui/spinner"
import { TooltipProvider } from "~/components/ui/tooltip"
import { ApiError } from "~/lib/api/client"

import type { Route } from "./+types/root"
import "./app.css"

export const meta: Route.MetaFunction = () => [{ title: "Find My Tracker" }]

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {/* In Layout (prerendered into index.html) so the theme applies before first paint. */}
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}

export default function App() {
  return (
    <TooltipProvider>
      <Outlet />
      <Toaster />
    </TooltipProvider>
  )
}

// Shown while the first client loader runs (SPA mode has no server render).
export function HydrateFallback() {
  return (
    <div className="flex min-h-svh items-center justify-center">
      <Spinner className="size-6 text-muted-foreground" />
    </div>
  )
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!"
  let details = "An unexpected error occurred."
  let stack: string | undefined

  // The dashboard session expired while the app was open.
  if (error instanceof ApiError && error.isUnauthenticated) {
    return <Navigate to="/login" replace />
  }

  if (error instanceof ApiError) {
    message = "Something went wrong"
    details = error.message
  } else if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error"
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message
    stack = error.stack
  }

  return (
    <main className="container mx-auto flex flex-col gap-2 p-4 pt-16">
      <h1 className="text-lg font-medium">{message}</h1>
      <p className="text-muted-foreground">{details}</p>
      {stack && (
        <pre className="w-full overflow-x-auto p-4">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  )
}
