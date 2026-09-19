import {
  ChartColumnIcon,
  CreditCardIcon,
  FunnelIcon,
  GlobeIcon,
  LayoutDashboardIcon,
  MailIcon,
  SettingsIcon,
  UsersIcon,
  WorkflowIcon,
  type LucideIcon,
} from "lucide-react"
import type { Route } from "next"
import { routes } from "./routes"

/**
 * The workspace navigation. Adding a module is one entry here: give it an
 * `href` when its pages exist; until then it shows as "Soon" and isn't
 * clickable.
 */
export type WorkspaceNavItem = {
  id: string
  label: string
  icon: LucideIcon
  /** One line, used on the dashboard's module overview. */
  description: string
  /** Built from the workspace slug. Absent while the module isn't available. */
  href?: (workspaceSlug: string) => Route
  /** "exact" for the workspace home, which every other path starts with. */
  match?: "exact" | "prefix"
}

export const WORKSPACE_NAV: readonly WorkspaceNavItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboardIcon,
    description: "Your workspace at a glance.",
    href: routes.workspace,
    match: "exact",
  },
  {
    id: "funnels",
    label: "Funnels",
    icon: FunnelIcon,
    description: "Multi-step funnels that turn visitors into customers.",
  },
  {
    id: "websites",
    label: "Websites",
    icon: GlobeIcon,
    description: "Fast, responsive sites on your own domain.",
  },
  {
    id: "leads",
    label: "Leads",
    icon: UsersIcon,
    description: "Every contact your funnels capture, in one place.",
  },
  {
    id: "emails",
    label: "Emails",
    icon: MailIcon,
    description: "Broadcasts and sequences to nurture your leads.",
  },
  {
    id: "automations",
    label: "Automations",
    icon: WorkflowIcon,
    description: "Workflows that follow up while you sleep.",
  },
  {
    id: "analytics",
    label: "Analytics",
    icon: ChartColumnIcon,
    description: "Conversion rates and revenue per step.",
  },
  {
    id: "payments",
    label: "Payments",
    icon: CreditCardIcon,
    description: "Checkouts, order bumps and upsells.",
  },
]

/** Pinned to the bottom of the sidebar. */
export const WORKSPACE_NAV_SECONDARY: readonly WorkspaceNavItem[] = [
  {
    id: "settings",
    label: "Settings",
    icon: SettingsIcon,
    description: "Workspace and account settings.",
    href: routes.workspaceSettings,
    match: "prefix",
  },
]

export function isNavItemActive(item: WorkspaceNavItem, workspaceSlug: string, pathname: string) {
  if (!item.href) return false
  const href: string = item.href(workspaceSlug)
  return item.match === "exact"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`)
}
