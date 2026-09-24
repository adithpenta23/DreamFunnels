import type { InvitableRole } from "./schemas"

/** What the public invitation page knows: display fields only, no ids. */
export type InvitationPreview = {
  status: "pending" | "expired" | "revoked" | "accepted"
  email: string
  role: InvitableRole
  workspaceName: string
  inviterName: string | null
  expiresAt: string
  /** Only for the person who accepted it. */
  workspaceSlug: string | null
}

/** An open invitation as owners and admins see it on the members page. */
export type OpenInvitation = {
  id: string
  email: string
  role: InvitableRole
  expiresAt: string
  createdAt: string
  lastSentAt: string | null
  deliveryStatus: "pending" | "sent" | "failed"
}

/** What happened to the invitation email. "sent" only when the provider accepted it. */
export type InvitationDelivery = "sent" | "not_sent"

export type InviteResult =
  | { status: "invited"; invitationId: string; email: string; delivery: InvitationDelivery }
  | { status: "already_pending"; invitationId: string; email: string }
  | { status: "already_member"; email: string }

/** An open invitation for the signed-in user's verified email (onboarding). */
export type PendingInvitation = {
  id: string
  workspaceName: string
  role: InvitableRole
  inviterName: string | null
  expiresAt: string
}
