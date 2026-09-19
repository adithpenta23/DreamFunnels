"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useCurrentWorkspace } from "@/components/providers/app-context"
import { Badge } from "@/components/ui/badge"
import {
  WORKSPACE_NAV,
  WORKSPACE_NAV_SECONDARY,
  isNavItemActive,
  type WorkspaceNavItem,
} from "@/config/navigation"
import { cn } from "@/lib/utils"
import { useUIStore } from "@/stores/ui-store"

const itemClass =
  "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground"

function NavEntry({ item }: { item: WorkspaceNavItem }) {
  const pathname = usePathname()
  const workspace = useCurrentWorkspace()
  const closeMobileNav = useUIStore((state) => state.setMobileNavOpen)
  const Icon = item.icon

  if (!item.href) {
    // Planned module: visible so the product's shape is clear, but inert.
    return (
      <span aria-disabled="true" className={cn(itemClass, "cursor-default opacity-60")}>
        <Icon className="size-4" aria-hidden />
        <span className="flex-1">{item.label}</span>
        <Badge variant="outline" className="h-4 px-1.5 text-[0.625rem] font-normal">
          Soon
        </Badge>
      </span>
    )
  }

  const active = isNavItemActive(item, workspace.slug, pathname)
  return (
    <Link
      href={item.href(workspace.slug)}
      aria-current={active ? "page" : undefined}
      onClick={() => closeMobileNav(false)}
      className={cn(
        itemClass,
        "transition-colors outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
        active && "bg-sidebar-accent text-foreground"
      )}
    >
      <Icon className="size-4" aria-hidden />
      {item.label}
    </Link>
  )
}

/** The workspace sidebar navigation, driven by config/navigation.ts. */
export function AppNav() {
  return (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-4">
      <ul className="grid gap-0.5">
        {WORKSPACE_NAV.map((item) => (
          <li key={item.id}>
            <NavEntry item={item} />
          </li>
        ))}
      </ul>
      <ul className="mt-auto grid gap-0.5">
        {WORKSPACE_NAV_SECONDARY.map((item) => (
          <li key={item.id}>
            <NavEntry item={item} />
          </li>
        ))}
      </ul>
    </nav>
  )
}
