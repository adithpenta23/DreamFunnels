"use server"

import { refresh } from "next/cache"
import { redirect } from "next/navigation"
import { routes } from "@/config/routes"
import { requireUser } from "@/features/auth/server/session"
import { inviteToWorkspace } from "@/features/invitations/server/invite"
import { validationFailed, type ActionFailure, type ActionResult } from "@/lib/action-result"
import { AppError, toPublicError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { runAction } from "@/lib/run-action"
import { canonicalTimezone } from "@/lib/timezones"
import { memberActionsFor } from "./lib/members"
import {
  changeMemberRoleSchema,
  createClientSchema,
  createWorkspaceSchema,
  memberRefSchema,
  updateWorkspaceProfileSchema,
  updateWorkspaceSchema,
} from "./schemas"
import {
  changeMemberRole,
  createClientWorkspace,
  createWorkspace,
  removeMember,
  updateWorkspace,
  updateWorkspaceProfile,
} from "./server/mutations"
import { listWorkspaceMembers, requireWorkspaceAccess } from "./server/queries"
import { limitClientCreation } from "./server/rate-limits"
import type { WorkspaceProfile, WorkspaceSummary } from "./types"

const field = (formData: FormData, name: string) => formData.get(name) ?? undefined
const text = (value: FormDataEntryValue | null) => (typeof value === "string" ? value : null)

/** Success redirects into the new workspace, so the form only sees failures. */
export type CreateWorkspaceState = ActionFailure | null

/** Creates an additional workspace (the first one comes from onboarding). */
export async function createWorkspaceAction(
  _previous: CreateWorkspaceState,
  formData: FormData
): Promise<CreateWorkspaceState> {
  const parsed = createWorkspaceSchema.safeParse({
    workspaceName: field(formData, "workspaceName"),
    workspaceSlug: field(formData, "workspaceSlug"),
  })
  if (!parsed.success) return validationFailed(parsed.error)

  const result = await runAction("workspaces.create", async () => {
    await requireUser()
    const workspace = await createWorkspace({
      name: parsed.data.workspaceName,
      slug: parsed.data.workspaceSlug,
      // The browser's zone, as a starting point; invalid hints are ignored.
      timezone: canonicalTimezone(text(formData.get("timezone"))) ?? undefined,
    })
    logger.info("workspaces.created", { workspaceId: workspace.id })
    return workspace
  })
  if (!result.ok) return result

  redirect(routes.workspace(result.data.slug))
}

export type UpdateWorkspaceState = ActionResult<{ slug: string; slugChanged: boolean }> | null

/**
 * Renames a workspace or changes its URL (owners and admins). When the URL
 * changes, the current page's URL no longer exists, so the client navigates
 * to the new one instead of refreshing this route.
 */
export async function updateWorkspaceAction(
  _previous: UpdateWorkspaceState,
  formData: FormData
): Promise<UpdateWorkspaceState> {
  const parsed = updateWorkspaceSchema.safeParse({
    workspaceId: field(formData, "workspaceId"),
    workspaceName: field(formData, "workspaceName"),
    workspaceSlug: field(formData, "workspaceSlug"),
  })
  if (!parsed.success) return validationFailed(parsed.error)
  const { workspaceId, workspaceName, workspaceSlug } = parsed.data

  return runAction("workspaces.update", async () => {
    const current = await requireWorkspaceAccess(workspaceId, "admin")
    const updated = await updateWorkspace(current.id, { name: workspaceName, slug: workspaceSlug })
    const slugChanged = updated.slug !== current.slug

    logger.info("workspaces.updated", { workspaceId: current.id, slugChanged })
    // Re-render the shell (switcher, titles) in this same response.
    if (!slugChanged) refresh()
    return { slug: updated.slug, slugChanged }
  })
}

export type UpdateWorkspaceProfileState = ActionResult<WorkspaceProfile> | null

const PROFILE_FIELDS = [
  "timezone",
  "businessName",
  "businessEmail",
  "businessPhone",
  "websiteUrl",
  "addressLine1",
  "addressLine2",
  "addressCity",
  "addressRegion",
  "addressPostalCode",
  "addressCountry",
  "logoUrl",
  "brandPrimaryColor",
  "brandSecondaryColor",
] as const satisfies readonly (keyof WorkspaceProfile)[]

/**
 * Saves the business profile (owners and admins, including the parent
 * agency's). Returns the values as stored — normalised phone, lowercase
 * colors — so the form shows exactly what was saved.
 */
export async function updateWorkspaceProfileAction(
  _previous: UpdateWorkspaceProfileState,
  formData: FormData
): Promise<UpdateWorkspaceProfileState> {
  const parsed = updateWorkspaceProfileSchema.safeParse(
    Object.fromEntries(
      [...PROFILE_FIELDS, "workspaceId"].map((name) => [name, field(formData, name)])
    )
  )
  if (!parsed.success) return validationFailed(parsed.error)
  const { workspaceId, ...profile } = parsed.data

  return runAction("workspaces.updateProfile", async () => {
    const workspace = await requireWorkspaceAccess(workspaceId, "admin")
    await updateWorkspaceProfile(workspace.id, profile)
    // Never the values: they are business contact details.
    logger.info("workspaces.profile_updated", { workspaceId: workspace.id })
    refresh()
    return profile
  })
}

// --- Clients -------------------------------------------------------------------

const CLIENT_FIELDS = [
  "agencyId",
  "businessName",
  "workspaceName",
  "workspaceSlug",
  "businessEmail",
  "businessPhone",
  "websiteUrl",
  "timezone",
  "addressLine1",
  "addressLine2",
  "addressCity",
  "addressRegion",
  "addressPostalCode",
  "addressCountry",
  "ownerEmail",
  "ownerRole",
] as const

export type CreateClientResult = {
  client: { name: string; slug: string }
  /**
   * The optional owner invitation: `sent` only when the provider accepted the
   * email; `not_sent` means it exists and can be resent from Members; `failed`
   * means it wasn't created (the message says why).
   */
  invitation: { email: string; outcome: "sent" | "not_sent" | "failed"; message?: string } | null
}

export type CreateClientState = ActionResult<CreateClientResult> | null

/**
 * Creates a client workspace under the agency (owners and admins), then
 * optionally invites the client's contact. The invitation is a separate step:
 * if it fails, the client still exists and the invitation can be sent from
 * its Members page. The agency comes from a form field but is only a
 * reference: access is checked here and again by the database function.
 */
export async function createClientWorkspaceAction(
  _previous: CreateClientState,
  formData: FormData
): Promise<CreateClientState> {
  const parsed = createClientSchema.safeParse(
    Object.fromEntries(CLIENT_FIELDS.map((name) => [name, field(formData, name)]))
  )
  if (!parsed.success) return validationFailed(parsed.error)
  const { agencyId, ownerEmail, ownerRole, workspaceName, workspaceSlug, ...profile } = parsed.data

  return runAction("workspaces.createClient", async () => {
    const user = await requireUser()
    const agency = await requireWorkspaceAccess(
      agencyId,
      "admin",
      "Only agency owners and admins can add client workspaces."
    )
    if (agency.type !== "agency") {
      throw new AppError("FORBIDDEN", "Client workspaces can only be added to an agency.", {
        expose: true,
        context: { workspaceId: agency.id },
      })
    }
    await limitClientCreation(user.id)

    const client = await createClientWorkspace(agency.id, {
      ...profile,
      name: workspaceName,
      slug: workspaceSlug,
    })
    logger.info("workspaces.client_created", { agencyId: agency.id, workspaceId: client.id })

    let invitation: CreateClientResult["invitation"] = null
    if (ownerEmail) {
      try {
        const result = await inviteToWorkspace({
          workspace: client,
          email: ownerEmail,
          role: ownerRole,
          message: null,
        })
        invitation = {
          email: ownerEmail,
          outcome: result.status === "invited" ? result.delivery : "not_sent",
        }
      } catch (error) {
        // The client exists either way; don't turn its creation into a failure.
        invitation = { email: ownerEmail, outcome: "failed", message: toPublicError(error).message }
        logger.warn("workspaces.client_invitation_failed", {
          workspaceId: client.id,
          code: error instanceof AppError ? error.code : "INTERNAL",
        })
      }
    }

    // The switcher shows the new client in this same response.
    refresh()
    return { client: { name: client.name, slug: client.slug }, invitation }
  })
}

// --- Members -------------------------------------------------------------------

/**
 * Loads what the caller may do to a member: they must manage members here,
 * the member must still exist, and memberActionsFor() must allow it (only
 * owners act on owners; nobody on themselves). RLS and the last-owner trigger
 * check again when the write runs.
 */
async function authorizeMemberChange(
  workspaceId: string,
  userId: string,
  action: "canChangeRole" | "canRemove"
): Promise<WorkspaceSummary> {
  const viewer = await requireUser()
  const workspace = await requireWorkspaceAccess(
    workspaceId,
    "admin",
    "Only workspace owners and admins can manage members."
  )
  if (userId === viewer.id) {
    throw new AppError("FORBIDDEN", "You can't change your own access here.", { expose: true })
  }
  const members = await listWorkspaceMembers(workspace.id)
  const target = members.find((member) => member.userId === userId)
  if (!target) {
    throw new AppError("NOT_FOUND", "That person is no longer a member of this workspace.", {
      expose: true,
      context: { workspaceId: workspace.id },
    })
  }
  const allowed = memberActionsFor({ userId: viewer.id, role: workspace.role }, target)[action]
  if (!allowed) {
    throw new AppError("FORBIDDEN", "Only owners can change or remove another owner.", {
      expose: true,
      context: { workspaceId: workspace.id, actual: workspace.role, target: target.role },
    })
  }
  return workspace
}

export async function changeMemberRoleAction(input: {
  workspaceId: string
  userId: string
  role: string
}): Promise<ActionResult<{ role: "member" | "admin" }>> {
  const parsed = changeMemberRoleSchema.safeParse(input)
  if (!parsed.success) return validationFailed(parsed.error)
  const { workspaceId, userId, role } = parsed.data

  return runAction("workspaces.changeMemberRole", async () => {
    const workspace = await authorizeMemberChange(workspaceId, userId, "canChangeRole")
    await changeMemberRole(workspace.id, userId, role)
    logger.info("workspaces.member_role_changed", {
      workspaceId: workspace.id,
      targetUserId: userId,
      role,
    })
    refresh()
    return { role }
  })
}

/** Removes a member's access to this workspace. Never deletes their account. */
export async function removeMemberAction(input: {
  workspaceId: string
  userId: string
}): Promise<ActionResult<null>> {
  const parsed = memberRefSchema.safeParse(input)
  if (!parsed.success) return validationFailed(parsed.error)
  const { workspaceId, userId } = parsed.data

  return runAction("workspaces.removeMember", async () => {
    const workspace = await authorizeMemberChange(workspaceId, userId, "canRemove")
    await removeMember(workspace.id, userId)
    logger.info("workspaces.member_removed", { workspaceId: workspace.id, targetUserId: userId })
    refresh()
    return null
  })
}
