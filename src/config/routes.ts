import type { Route } from "next"

const workspaceBase = (slug: string) => `/w/${encodeURIComponent(slug)}`

/** Single source of truth for app paths. Prefer these over string literals. */
export const routes = {
  home: "/",
  login: "/login",
  signup: "/signup",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  authCallback: "/auth/callback",
  /** Post-sign-in landing: sends users to onboarding or their last workspace. */
  dashboard: "/dashboard",
  onboarding: "/onboarding",
  newWorkspace: "/workspaces/new",
  workspace: (slug: string) => workspaceBase(slug) as Route,
  workspaceSettings: (slug: string) => `${workspaceBase(slug)}/settings` as Route,
  accountSettings: (slug: string) => `${workspaceBase(slug)}/settings/account` as Route,
} as const

/** Where signed-in users land by default. */
export const DEFAULT_AUTHENTICATED_PATH = routes.dashboard

/**
 * Path prefixes that require a session. The proxy uses this for fast
 * redirects, but it is NOT the security boundary: pages, actions and RLS each
 * verify access independently (see docs/ARCHITECTURE.md#authorization).
 */
export const PROTECTED_PATH_PREFIXES = ["/dashboard", "/onboarding", "/workspaces", "/w"] as const

/**
 * Pages that signed-in users should skip. `/reset-password` is deliberately
 * absent: the recovery link signs the user in before they choose a password.
 */
export const GUEST_ONLY_PATH_PREFIXES = ["/login", "/signup", "/forgot-password"] as const

export function matchesPathPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}
