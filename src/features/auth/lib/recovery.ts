/**
 * Password-recovery sessions.
 *
 * Following a reset link signs the user in. The reset page may then set a new
 * password without asking for the old one, so it must only work for sessions
 * that were created by an emailed link, and only shortly after the link was
 * used. Any other session has to go through "change password", which asks
 * for the current password.
 *
 * Supabase Auth records how a session was created in the JWT's `amr` claim,
 * and the method depends on the link style:
 *   - PKCE `?code=` link (default templates):         "recovery"
 *   - `?token_hash=` link (supabase/templates/*.html): "otp" (every
 *     verification through POST /verify is recorded as an OTP)
 *   - magic link:                                      "magiclink"
 * All three prove the user controls the account's inbox right now, which is
 * exactly what "forgot password" relies on anyway. A session keeps the
 * methods it was created with, so a stolen password session never passes.
 */

/** How long after following a link the user may choose a new password. */
export const RECOVERY_WINDOW_SECONDS = 60 * 60

/** `amr` methods that mean "signed in by a link or code sent to the user's email". */
export const EMAIL_LINK_METHODS: ReadonlySet<string> = new Set(["recovery", "otp", "magiclink"])

/** Tolerated clock skew between the Auth server and this server. */
const CLOCK_SKEW_SECONDS = 60

export function isRecentRecovery(
  amr: unknown,
  nowSeconds: number,
  windowSeconds: number = RECOVERY_WINDOW_SECONDS
): boolean {
  if (!Array.isArray(amr)) return false
  return amr.some((entry: unknown) => {
    // Only the detailed form carries a timestamp; the bare-string form can't
    // prove recency, so it doesn't count.
    if (typeof entry !== "object" || entry === null) return false
    const { method, timestamp } = entry as { method?: unknown; timestamp?: unknown }
    return (
      typeof method === "string" &&
      EMAIL_LINK_METHODS.has(method) &&
      typeof timestamp === "number" &&
      timestamp <= nowSeconds + CLOCK_SKEW_SECONDS &&
      nowSeconds - timestamp <= windowSeconds
    )
  })
}
