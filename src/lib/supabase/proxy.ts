import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { publicEnv } from "@/lib/env/public"
import { logger } from "@/lib/logger"
import type { Database } from "@/types/database.types"
import { hasSessionCookie } from "./session-cookie"

export type SessionUpdate = {
  /** Response carrying any refreshed auth cookies. Return it (or copy its cookies). */
  response: NextResponse
  /** Verified user id from the JWT, or null when signed out / invalid. */
  userId: string | null
  /** The request carried a session cookie that no longer verifies (expired, revoked or tampered). */
  sessionExpired: boolean
}

/**
 * Refreshes the Supabase session for the incoming request and reports who
 * the user is. Called from src/proxy.ts on every matched request so Server
 * Components always see a fresh token.
 */
export async function updateSession(request: NextRequest): Promise<SessionUpdate> {
  let response = NextResponse.next({ request })
  const hadSession = hasSessionCookie(request.cookies.getAll().map((cookie) => cookie.name))

  const supabase = createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
          // Cache-Control/Expires/Pragma: responses that set auth cookies must never be cached.
          for (const [key, value] of Object.entries(headers)) response.headers.set(key, value)
        },
      },
    }
  )

  // Keep this call immediately after client creation: it validates the JWT
  // and triggers the token refresh that setAll() writes back.
  try {
    const { data, error } = await supabase.auth.getClaims()
    if (error) {
      logger.debug("auth.session_invalid", { reason: error.message })
    }
    const userId = data?.claims.sub ?? null
    return { response, userId, sessionExpired: hadSession && !userId }
  } catch (error) {
    // Fail closed: an auth outage must never grant access.
    logger.warn("auth.session_check_failed", { error })
    return { response, userId: null, sessionExpired: false }
  }
}

/** Redirect while preserving any auth cookies set during the session refresh. */
export function redirectWithSession(url: URL, sessionResponse: NextResponse): NextResponse {
  const redirect = NextResponse.redirect(url)
  for (const cookie of sessionResponse.cookies.getAll()) redirect.cookies.set(cookie)
  const cacheControl = sessionResponse.headers.get("cache-control")
  if (cacheControl) redirect.headers.set("cache-control", cacheControl)
  return redirect
}
