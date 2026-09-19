import "server-only"

import { redirect } from "next/navigation"
import { cache } from "react"
import { routes } from "@/config/routes"
import { createClient } from "@/lib/supabase/server"
import { isRecentRecovery } from "../lib/recovery"

export type SessionUser = {
  id: string
  email: string | null
}

/**
 * The verified JWT claims of the current session, or null. `getClaims()`
 * validates the signature (never trust `getSession()` on the server) and
 * refreshes an expired access token. Memoised per request.
 */
const getVerifiedClaims = cache(async () => {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()
  if (error || !data) return null
  return data.claims
})

/**
 * The verified current user, or null. Memoised per request, so layouts,
 * pages and data functions can all call it freely.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const claims = await getVerifiedClaims()
  if (!claims) return null
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null }
})

/**
 * Authorization gate for protected pages, layouts, actions and data
 * functions. Call it next to the data it protects — not only in a layout,
 * because layouts don't re-run on client-side navigation.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser()
  if (!user) redirect(routes.login)
  return user
}

/**
 * True when the current session was created by a password-reset link within
 * the recovery window. Gates the reset form, which sets a password without
 * asking for the current one (see ../lib/recovery.ts).
 */
export async function isRecoverySession(): Promise<boolean> {
  const claims = await getVerifiedClaims()
  if (!claims) return false
  return isRecentRecovery(claims.amr, Math.floor(Date.now() / 1000))
}
