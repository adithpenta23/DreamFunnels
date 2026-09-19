/**
 * Password-recovery sessions.
 *
 * Following a reset link signs the user in, and Supabase Auth records that in
 * the JWT's `amr` (authentication methods) claim as `{ method: "recovery" }`.
 * The reset page may set a new password without asking for the old one, so it
 * must only work for such sessions, and only shortly after the link was used.
 * Any other session has to go through "change password", which asks for the
 * current password.
 */

/** How long after following a reset link the user may choose a new password. */
export const RECOVERY_WINDOW_SECONDS = 60 * 60

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
      method === "recovery" &&
      typeof timestamp === "number" &&
      timestamp <= nowSeconds + CLOCK_SKEW_SECONDS &&
      nowSeconds - timestamp <= windowSeconds
    )
  })
}
