import type { OpenInvitation } from "../types"

/**
 * How an open invitation reads in the members page. Pure, and computed on the
 * server with one `now`, so the text doesn't depend on the viewer's clock.
 */

export type InvitationRowStatus = "pending" | "expired" | "not_delivered"

export function invitationRowStatus(
  invitation: Pick<OpenInvitation, "expiresAt" | "deliveryStatus">,
  now: Date
): InvitationRowStatus {
  if (new Date(invitation.expiresAt).getTime() <= now.getTime()) return "expired"
  if (invitation.deliveryStatus === "failed") return "not_delivered"
  return "pending"
}

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" })
const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** "in 6 days", "tomorrow", "in 3 hours", "in 20 minutes", "2 days ago". */
export function relativeTime(target: Date, now: Date): string {
  const difference = target.getTime() - now.getTime()
  const size = Math.abs(difference)
  if (size < HOUR) return relative.format(Math.round(difference / MINUTE), "minute")
  if (size < DAY) return relative.format(Math.round(difference / HOUR), "hour")
  return relative.format(Math.round(difference / DAY), "day")
}

export const INVITATION_STATUS_LABELS: Record<InvitationRowStatus, string> = {
  pending: "Pending",
  expired: "Expired",
  not_delivered: "Email not delivered",
}

/** The line under a pending invitation: when it expires, or expired. */
export function invitationStatusDetail(
  invitation: Pick<OpenInvitation, "expiresAt" | "deliveryStatus">,
  now: Date
): string {
  const expiresAt = new Date(invitation.expiresAt)
  const when = relativeTime(expiresAt, now)
  return expiresAt.getTime() <= now.getTime() ? `Expired ${when}` : `Expires ${when}`
}
