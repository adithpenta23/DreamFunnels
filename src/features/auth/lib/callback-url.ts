import { routes } from "@/config/routes"
import { getSafeRedirectPath } from "./redirect"

/**
 * The absolute `/auth/callback` URL that Supabase email links (confirmation,
 * password reset) return to, carrying where to go next. Every environment's
 * callback URL must be in the Auth redirect allow-list (see README).
 */
export function buildAuthCallbackUrl(appUrl: string, next: string): string {
  const url = new URL(routes.authCallback, appUrl)
  url.searchParams.set("next", getSafeRedirectPath(next))
  return url.toString()
}
