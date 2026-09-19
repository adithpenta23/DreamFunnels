import {
  GUEST_ONLY_PATH_PREFIXES,
  PROTECTED_PATH_PREFIXES,
  matchesPathPrefix,
  routes,
} from "@/config/routes"
import { getSafeRedirectPath } from "./redirect"

export type AuthRoutingInput = {
  method: string
  pathname: string
  /** The query string including its leading "?", or "". */
  search: string
  /** The raw `?next=` parameter, if any. */
  next: string | null
  isSignedIn: boolean
  /** The request carried a session cookie that no longer verifies. */
  sessionExpired: boolean
}

/** Why the login page is being shown; rendered as a notice there. */
export const LOGIN_REASONS = ["session_expired"] as const
export type LoginReason = (typeof LOGIN_REASONS)[number]

/**
 * Decides where the proxy should redirect a request, or null to let it
 * through. UX only: every page, action and RLS policy re-checks access.
 *
 * Only page navigations are redirected. A Server Action is a POST to the page
 * it was rendered on; redirecting it would make the browser replay the POST
 * against the login page, so it goes through and its own `requireUser()`
 * answers instead.
 */
export function getAuthRedirect(input: AuthRoutingInput): string | null {
  if (input.method !== "GET" && input.method !== "HEAD") return null

  if (!input.isSignedIn && matchesPathPrefix(input.pathname, PROTECTED_PATH_PREFIXES)) {
    const params = new URLSearchParams({ next: `${input.pathname}${input.search}` })
    if (input.sessionExpired) params.set("reason", "session_expired" satisfies LoginReason)
    return `${routes.login}?${params.toString()}`
  }

  if (input.isSignedIn && matchesPathPrefix(input.pathname, GUEST_ONLY_PATH_PREFIXES)) {
    return getSafeRedirectPath(input.next)
  }

  return null
}
