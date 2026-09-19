"use client"

import type { Route } from "next"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { routes } from "@/config/routes"
import { cn } from "@/lib/utils"

/** Settings sections. Members, billing and domains will be added here. */
function sectionsFor(workspaceSlug: string): { label: string; href: Route }[] {
  return [
    { label: "General", href: routes.workspaceSettings(workspaceSlug) },
    { label: "Account", href: routes.accountSettings(workspaceSlug) },
  ]
}

export function SettingsNav({ workspaceSlug }: { workspaceSlug: string }) {
  const pathname = usePathname()

  return (
    <nav aria-label="Settings" className="border-b">
      <ul className="-mb-px flex gap-4">
        {sectionsFor(workspaceSlug).map(({ label, href }) => {
          const active = pathname === href
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex border-b-2 border-transparent px-1 pb-2 text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
                  active && "border-foreground text-foreground"
                )}
              >
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
