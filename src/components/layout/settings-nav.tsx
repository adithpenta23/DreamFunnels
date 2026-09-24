"use client"

import type { Route } from "next"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { routes } from "@/config/routes"
import { cn } from "@/lib/utils"

/**
 * Settings sections. Billing and domains will be added here. The audit log is
 * listed for owners and admins only (its page explains the restriction to
 * anyone else, and the data is refused by the database).
 */
function sectionsFor(
  workspaceSlug: string,
  showAuditLog: boolean
): { label: string; href: Route }[] {
  return [
    { label: "General", href: routes.workspaceSettings(workspaceSlug) },
    { label: "Members", href: routes.workspaceMembers(workspaceSlug) },
    ...(showAuditLog ? [{ label: "Audit log", href: routes.auditLog(workspaceSlug) }] : []),
    { label: "Account", href: routes.accountSettings(workspaceSlug) },
  ]
}

export function SettingsNav({
  workspaceSlug,
  showAuditLog = false,
}: {
  workspaceSlug: string
  showAuditLog?: boolean
}) {
  const pathname = usePathname()

  return (
    <nav aria-label="Settings" className="-mx-1 overflow-x-auto border-b px-1">
      <ul className="-mb-px flex gap-4 whitespace-nowrap">
        {sectionsFor(workspaceSlug, showAuditLog).map(({ label, href }) => {
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
