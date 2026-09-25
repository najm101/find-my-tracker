import { ChevronLeftIcon } from "lucide-react"
import type { ReactNode } from "react"
import { Link } from "react-router"

import { Button } from "~/components/ui/button"

/** One settings page: its title, and on a phone the way back to the list. */
export function SettingsPage({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <Button asChild variant="ghost" size="sm" className="-ml-2.5 md:hidden">
          <Link to="/settings">
            <ChevronLeftIcon />
            Settings
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description && <p className="text-muted-foreground">{description}</p>}
      </header>
      {children}
    </div>
  )
}
