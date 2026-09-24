import { routes } from "@/config/routes"
import { isWellFormedInvitationToken } from "./tokens"

/**
 * Carrying an invitation through email confirmation.
 *
 * Someone who signs up from an invitation where email confirmation is on
 * (staging, production) leaves for their inbox. The confirmation template
 * always returns to /auth/callback?…&next=/dashboard, so the sign-up action
 * leaves an opaque reference, the invitation token, in an httpOnly cookie, and
 * the callback sends them back to /invite/<token> once confirmed.
 *
 * The cookie grants nothing: the invitation page re-validates the token and
 * acceptance still requires the signed-in, verified email to match. If the
 * link is opened on another device the cookie isn't there, and the invitee
 * simply opens the invitation link again.
 */

export const PENDING_INVITATION_COOKIE = "df_pending_invitation"

/** Confirmation links last an hour (supabase/config.toml otp_expiry); a day is plenty. */
export const PENDING_INVITATION_MAX_AGE_SECONDS = 60 * 60 * 24

/**
 * Where /auth/callback should send someone who just confirmed their email:
 * back to their invitation when one is pending and they were headed for the
 * default landing page; otherwise where they were going.
 */
export function destinationAfterEmailLink(next: string, pendingToken: string | undefined): string {
  if (next === routes.dashboard && isWellFormedInvitationToken(pendingToken)) {
    return routes.invitation(pendingToken)
  }
  return next
}
