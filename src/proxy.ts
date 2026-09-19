import type { NextRequest } from "next/server"
import { getAuthRedirect } from "@/features/auth/lib/auth-routing"
import { redirectWithSession, updateSession } from "@/lib/supabase/proxy"

/**
 * Network-edge concerns only: keep the Supabase session fresh and bounce
 * obviously-unauthenticated navigations to the login page (and signed-in
 * users away from the guest-only auth pages).
 *
 * This is a UX optimisation, not the security boundary. Every protected page
 * re-checks the session on the server (requireUser) and the database enforces
 * tenant isolation with RLS, so a proxy bypass exposes nothing.
 *
 * Future: host-based routing for published funnels on custom domains will
 * also live here (rewrite unknown hosts to the public site renderer).
 */
export async function proxy(request: NextRequest) {
  const { response, userId, sessionExpired } = await updateSession(request)
  const { pathname, search, searchParams } = request.nextUrl

  const destination = getAuthRedirect({
    method: request.method,
    pathname,
    search,
    next: searchParams.get("next"),
    isSignedIn: userId !== null,
    sessionExpired,
  })

  return destination ? redirectWithSession(new URL(destination, request.url), response) : response
}

export const config = {
  matcher: [
    // Everything except static assets, image optimisation, and the health check.
    "/((?!_next/static|_next/image|api/health|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
}
