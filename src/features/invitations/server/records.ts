import "server-only"

import { AppError } from "@/lib/errors"
import { createClient } from "@/lib/supabase/server"
import { toInvitationWriteError, type AcceptFailure } from "../lib/errors"
import type { InvitableRole } from "../schemas"

/**
 * The invitation functions in Postgres, called as the signed-in user. Each one
 * re-checks the caller's role itself (SECURITY DEFINER with its own checks),
 * so these wrappers only translate arguments and results.
 */

function noRow(fn: string): AppError {
  return new AppError("INTERNAL", `${fn} returned no row`)
}

export async function createInvitationRecord(input: {
  workspaceId: string
  email: string
  role: InvitableRole
  tokenHash: string
  message: string | null
}) {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("create_workspace_invitation", {
    p_workspace_id: input.workspaceId,
    p_email: input.email,
    p_role: input.role,
    p_token_hash: input.tokenHash,
    ...(input.message ? { p_message: input.message } : {}),
  })
  if (error) throw toInvitationWriteError(error)
  const row = data[0]
  if (!row) throw noRow("create_workspace_invitation")
  return {
    outcome: row.outcome as "created" | "already_pending" | "already_member",
    invitationId: row.invitation_id,
    expiresAt: row.invitation_expires_at,
  }
}

export async function resendInvitationRecord(input: {
  workspaceId: string
  invitationId: string
  tokenHash: string
}) {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("resend_workspace_invitation", {
    p_workspace_id: input.workspaceId,
    p_invitation_id: input.invitationId,
    p_token_hash: input.tokenHash,
  })
  if (error) throw toInvitationWriteError(error)
  const row = data[0]
  if (!row) throw noRow("resend_workspace_invitation")
  return {
    outcome: row.outcome as "resent" | "not_found" | "accepted" | "revoked",
    email: row.invitation_email,
    role: row.invitation_role as InvitableRole | null,
    message: row.invitation_message,
    expiresAt: row.invitation_expires_at,
  }
}

export async function revokeInvitationRecord(input: { workspaceId: string; invitationId: string }) {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("revoke_workspace_invitation", {
    p_workspace_id: input.workspaceId,
    p_invitation_id: input.invitationId,
  })
  if (error) throw toInvitationWriteError(error)
  return data as "revoked" | "not_found" | "accepted"
}

/** Records whether the email for this token went out. Superseded tokens change nothing. */
export async function recordInvitationDelivery(input: {
  invitationId: string
  tokenHash: string
  delivered: boolean
  messageId: string | null
}) {
  const supabase = await createClient()
  const { error } = await supabase.rpc("record_workspace_invitation_delivery", {
    p_invitation_id: input.invitationId,
    p_token_hash: input.tokenHash,
    p_delivered: input.delivered,
    ...(input.messageId ? { p_message_id: input.messageId } : {}),
  })
  if (error) throw toInvitationWriteError(error)
}

export type AcceptOutcome =
  { ok: true; workspaceSlug: string; alreadyMember: boolean } | { ok: false; reason: AcceptFailure }

export async function acceptInvitationRecord(tokenHash: string): Promise<AcceptOutcome> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("accept_workspace_invitation", {
    p_token_hash: tokenHash,
  })
  if (error) throw toInvitationWriteError(error)
  const row = data[0]
  if (!row) throw noRow("accept_workspace_invitation")
  return toAcceptOutcome(row)
}

/** Both acceptance paths answer the same way (they share one database routine). */
function toAcceptOutcome(row: { outcome: string; workspace_slug: string | null }): AcceptOutcome {
  if ((row.outcome === "accepted" || row.outcome === "already_member") && row.workspace_slug) {
    return {
      ok: true,
      workspaceSlug: row.workspace_slug,
      alreadyMember: row.outcome === "already_member",
    }
  }
  return { ok: false, reason: row.outcome as AcceptFailure }
}

/** Accepts one of the caller's pending invitations by id (the onboarding list). */
export async function acceptInvitationByIdRecord(invitationId: string): Promise<AcceptOutcome> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("accept_workspace_invitation_by_id", {
    p_invitation_id: invitationId,
  })
  if (error) throw toInvitationWriteError(error)
  const row = data[0]
  if (!row) throw noRow("accept_workspace_invitation_by_id")
  return toAcceptOutcome(row)
}
