"use server"

import { refresh } from "next/cache"
import { cookies } from "next/headers"
import { saveProfile } from "@/features/account/server/profile"
import { getCurrentUser } from "@/features/auth/server/session"
import { listWorkspaceMembers, requireWorkspaceAccess } from "@/features/workspaces/server/queries"
import { validationFailed, type ActionResult } from "@/lib/action-result"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { runAction } from "@/lib/run-action"
import { acceptFailureError } from "./lib/errors"
import { PENDING_INVITATION_COOKIE } from "./lib/pending-invitation"
import {
  acceptInvitationSchema,
  acceptPendingInvitationSchema,
  invitationRefSchema,
  inviteMemberSchema,
} from "./schemas"
import { inviteToWorkspace, resendInvitation } from "./server/invite"
import {
  acceptInvitationByIdRecord,
  acceptInvitationRecord,
  revokeInvitationRecord,
} from "./server/records"
import { hashInvitationToken } from "./server/tokens"
import type { InvitationDelivery, InviteResult } from "./types"

/**
 * Invitation mutations. Managing invitations needs owner or admin access to
 * the workspace (checked here, and again inside every database function);
 * accepting needs a signed-in user whose verified email is the invited one.
 * Tokens are never logged: events carry workspace and invitation ids only.
 */

const MANAGE_INVITATIONS = "Only workspace owners and admins can manage invitations."
const field = (formData: FormData, name: string) => formData.get(name) ?? undefined

export type InviteMemberState = ActionResult<InviteResult> | null

/**
 * Invites someone by email. An address that's already a member is a field
 * error; one with a pending invitation comes back as `already_pending` so the
 * dialog can offer to resend or cancel it.
 */
export async function inviteMemberAction(
  _previous: InviteMemberState,
  formData: FormData
): Promise<InviteMemberState> {
  const parsed = inviteMemberSchema.safeParse({
    workspaceId: field(formData, "workspaceId"),
    email: field(formData, "email"),
    role: field(formData, "role"),
    message: field(formData, "message"),
  })
  if (!parsed.success) return validationFailed(parsed.error)
  const { workspaceId, email, role, message } = parsed.data

  return runAction("invitations.invite", async () => {
    const workspace = await requireWorkspaceAccess(workspaceId, "admin", MANAGE_INVITATIONS)
    const result = await inviteToWorkspace({ workspace, email, role, message })

    if (result.status === "already_member") {
      const members = await listWorkspaceMembers(workspace.id)
      const member = members.find((candidate) => candidate.email?.toLowerCase() === email)
      const who = member?.fullName?.trim() || email
      throw new AppError("CONFLICT", "Already a member", {
        context: { workspaceId: workspace.id },
        fieldErrors: { email: [`${who} is already a member of this workspace.`] },
      })
    }
    if (result.status === "invited") refresh()
    return result
  })
}

export async function resendInvitationAction(input: {
  workspaceId: string
  invitationId: string
}): Promise<ActionResult<{ email: string; delivery: InvitationDelivery }>> {
  const parsed = invitationRefSchema.safeParse(input)
  if (!parsed.success) return validationFailed(parsed.error)

  return runAction("invitations.resend", async () => {
    const workspace = await requireWorkspaceAccess(
      parsed.data.workspaceId,
      "admin",
      MANAGE_INVITATIONS
    )
    const result = await resendInvitation({ workspace, invitationId: parsed.data.invitationId })
    refresh()
    return result
  })
}

/** Cancels an open invitation: its link stops working. The record is kept. */
export async function revokeInvitationAction(input: {
  workspaceId: string
  invitationId: string
}): Promise<ActionResult<null>> {
  const parsed = invitationRefSchema.safeParse(input)
  if (!parsed.success) return validationFailed(parsed.error)

  return runAction("invitations.revoke", async () => {
    const workspace = await requireWorkspaceAccess(
      parsed.data.workspaceId,
      "admin",
      MANAGE_INVITATIONS
    )
    const outcome = await revokeInvitationRecord({
      workspaceId: workspace.id,
      invitationId: parsed.data.invitationId,
    })
    if (outcome === "not_found") {
      throw new AppError("NOT_FOUND", "This invitation no longer exists.", { expose: true })
    }
    if (outcome === "accepted") {
      throw new AppError(
        "CONFLICT",
        "This invitation was already accepted. Remove the member instead.",
        { expose: true }
      )
    }
    logger.info("workspaces.invitation_revoked", {
      workspaceId: workspace.id,
      invitationId: parsed.data.invitationId,
    })
    refresh()
    return null
  })
}

export type AcceptInvitationState = ActionResult<{
  workspaceSlug: string
  alreadyMember: boolean
}> | null

/**
 * Accepts the invitation in the form for the signed-in user. The token is the
 * only input that matters: the database resolves the workspace and role from
 * it, and requires the caller's verified email to be the invited one.
 */
export async function acceptInvitationAction(
  _previous: AcceptInvitationState,
  formData: FormData
): Promise<AcceptInvitationState> {
  const parsed = acceptInvitationSchema.safeParse({
    token: field(formData, "token"),
    fullName: field(formData, "fullName"),
  })
  if (!parsed.success) return validationFailed(parsed.error)
  const { token, fullName } = parsed.data

  return runAction("invitations.accept", async () => {
    const user = await getCurrentUser()
    if (!user) {
      throw new AppError("UNAUTHENTICATED", "Your session has ended. Sign in again to accept.", {
        expose: true,
      })
    }

    const outcome = await acceptInvitationRecord(hashInvitationToken(token))
    if (!outcome.ok) throw acceptFailureError(outcome.reason)

    if (fullName) {
      try {
        await saveProfile(user.id, { fullName })
      } catch (error) {
        // They're in; the name can be set in account settings.
        logger.warn("invitations.name_not_saved", { error })
      }
    }
    // A reference left by sign-up for the email-confirmation round trip.
    ;(await cookies()).delete(PENDING_INVITATION_COOKIE)

    logger.info("workspaces.invitation_accepted", { alreadyMember: outcome.alreadyMember })
    return { workspaceSlug: outcome.workspaceSlug, alreadyMember: outcome.alreadyMember }
  })
}

/**
 * Accepts one of the signed-in user's pending invitations (the onboarding
 * list, for people who confirmed their email without the invitation link at
 * hand). The id is only a reference: the database re-checks that the
 * caller's verified email is the invited one and takes the workspace and role
 * from the invitation. Nothing is accepted without this explicit action.
 */
export async function acceptPendingInvitationAction(input: {
  invitationId: string
  fullName?: string
}): Promise<ActionResult<{ workspaceSlug: string; alreadyMember: boolean }>> {
  const parsed = acceptPendingInvitationSchema.safeParse(input)
  if (!parsed.success) return validationFailed(parsed.error)
  const { invitationId, fullName } = parsed.data

  return runAction("invitations.acceptPending", async () => {
    const user = await getCurrentUser()
    if (!user) {
      throw new AppError("UNAUTHENTICATED", "Your session has ended. Sign in again to accept.", {
        expose: true,
      })
    }

    const outcome = await acceptInvitationByIdRecord(invitationId)
    if (!outcome.ok) throw acceptFailureError(outcome.reason)

    if (fullName) {
      try {
        await saveProfile(user.id, { fullName })
      } catch (error) {
        logger.warn("invitations.name_not_saved", { error })
      }
    }
    logger.info("workspaces.invitation_accepted", {
      alreadyMember: outcome.alreadyMember,
      method: "pending_list",
    })
    return { workspaceSlug: outcome.workspaceSlug, alreadyMember: outcome.alreadyMember }
  })
}
