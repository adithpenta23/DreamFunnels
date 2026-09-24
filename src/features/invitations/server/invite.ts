import "server-only"

import { getCurrentProfile } from "@/features/account/server/profile"
import { getWorkspaceProfile } from "@/features/workspaces/server/queries"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import type { InvitableRole } from "../schemas"
import type { InvitationDelivery, InviteResult } from "../types"
import { sendInvitationEmail } from "./email"
import { findOpenInvitationEmail } from "./queries"
import { limitInvitationEmails } from "./rate-limits"
import { createInvitationRecord, recordInvitationDelivery, resendInvitationRecord } from "./records"
import { generateInvitationToken, hashInvitationToken } from "./tokens"

/**
 * Inviting people. The order matters:
 *   1. rate limits (nothing is written when blocked);
 *   2. the invitation row, committed by its own database call;
 *   3. the email, sent only after the commit, outside any transaction;
 *   4. the delivery result, recorded against this token.
 * A provider failure therefore never loses or corrupts the invitation: it
 * stays valid, the list shows "Email not delivered", and it can be resent.
 *
 * Callers authorize first (requireWorkspaceAccess); the database functions
 * check the caller's role again.
 */

type Workspace = { id: string; name: string }

async function inviterName(): Promise<{ id: string; name: string }> {
  const profile = await getCurrentProfile()
  const name = profile.fullName?.trim() || profile.email
  if (!name) throw new AppError("INTERNAL", "Inviter has neither a name nor an email")
  return { id: profile.id, name }
}

async function deliver(input: {
  workspace: Workspace
  invitationId: string
  token: string
  tokenHash: string
  email: string
  role: InvitableRole
  message: string | null
  expiresAt: string
  inviter: string
}): Promise<InvitationDelivery> {
  const { timezone } = await getWorkspaceProfile(input.workspace.id)
  const result = await sendInvitationEmail({
    invitationId: input.invitationId,
    token: input.token,
    tokenHash: input.tokenHash,
    to: input.email,
    role: input.role,
    workspaceId: input.workspace.id,
    workspaceName: input.workspace.name,
    timeZone: timezone,
    inviterName: input.inviter,
    message: input.message,
    expiresAt: new Date(input.expiresAt),
  })

  const context = { workspaceId: input.workspace.id, invitationId: input.invitationId }
  try {
    await recordInvitationDelivery({
      invitationId: input.invitationId,
      tokenHash: input.tokenHash,
      delivered: result.ok,
      messageId: result.ok ? result.messageId : null,
    })
  } catch (error) {
    // Bookkeeping only: the invitation and the email are what matter.
    logger.warn("workspaces.invitation_delivery_unrecorded", { ...context, error })
  }

  if (result.ok) {
    logger.info("workspaces.invitation_sent", context)
    return "sent"
  }
  logger.warn("workspaces.invitation_failed", { ...context, reason: result.reason })
  return "not_sent"
}

/** Invites `email` (validated, normalised) to the workspace and emails them. */
export async function inviteToWorkspace(input: {
  workspace: Workspace
  email: string
  role: InvitableRole
  message: string | null
}): Promise<InviteResult> {
  const inviter = await inviterName()
  await limitInvitationEmails({
    senderId: inviter.id,
    workspaceId: input.workspace.id,
    recipientEmail: input.email,
  })

  const token = generateInvitationToken()
  const tokenHash = hashInvitationToken(token)
  const created = await createInvitationRecord({
    workspaceId: input.workspace.id,
    email: input.email,
    role: input.role,
    tokenHash,
    message: input.message,
  })

  if (created.outcome === "already_member") {
    return { status: "already_member", email: input.email }
  }
  if (!created.invitationId || !created.expiresAt) {
    throw new AppError("INTERNAL", "Invitation function returned no invitation")
  }
  if (created.outcome === "already_pending") {
    return { status: "already_pending", invitationId: created.invitationId, email: input.email }
  }

  logger.info("workspaces.member_invited", {
    workspaceId: input.workspace.id,
    invitationId: created.invitationId,
    role: input.role,
  })
  const delivery = await deliver({
    workspace: input.workspace,
    invitationId: created.invitationId,
    token,
    tokenHash,
    email: input.email,
    role: input.role,
    message: input.message,
    expiresAt: created.expiresAt,
    inviter: inviter.name,
  })
  return { status: "invited", invitationId: created.invitationId, email: input.email, delivery }
}

/**
 * Sends an open invitation again with a new token (the previous link stops
 * working) and a fresh expiry.
 */
export async function resendInvitation(input: {
  workspace: Workspace
  invitationId: string
}): Promise<{ email: string; delivery: InvitationDelivery }> {
  const inviter = await inviterName()
  // Same budgets as a new invitation, checked before the token is rotated so a
  // blocked resend leaves the current link working.
  const recipient = await findOpenInvitationEmail(input.workspace.id, input.invitationId)
  if (!recipient) {
    throw new AppError("NOT_FOUND", "This invitation no longer exists.", { expose: true })
  }
  await limitInvitationEmails({
    senderId: inviter.id,
    workspaceId: input.workspace.id,
    recipientEmail: recipient,
  })

  const token = generateInvitationToken()
  const tokenHash = hashInvitationToken(token)
  const resent = await resendInvitationRecord({
    workspaceId: input.workspace.id,
    invitationId: input.invitationId,
    tokenHash,
  })
  if (resent.outcome === "not_found") {
    throw new AppError("NOT_FOUND", "This invitation no longer exists.", { expose: true })
  }
  if (resent.outcome === "accepted") {
    throw new AppError("CONFLICT", "This invitation has already been accepted.", { expose: true })
  }
  if (resent.outcome === "revoked") {
    throw new AppError("CONFLICT", "This invitation was cancelled. Send a new one instead.", {
      expose: true,
    })
  }
  if (!resent.email || !resent.role || !resent.expiresAt) {
    throw new AppError("INTERNAL", "Invitation function returned no invitation")
  }

  logger.info("workspaces.invitation_resent", {
    workspaceId: input.workspace.id,
    invitationId: input.invitationId,
  })
  const delivery = await deliver({
    workspace: input.workspace,
    invitationId: input.invitationId,
    token,
    tokenHash,
    email: resent.email,
    role: resent.role,
    message: resent.message,
    expiresAt: resent.expiresAt,
    inviter: inviter.name,
  })
  return { email: resent.email, delivery }
}
