"use server"

import { refresh } from "next/cache"
import { redirect } from "next/navigation"
import { routes } from "@/config/routes"
import { requireUser } from "@/features/auth/server/session"
import { validationFailed, type ActionFailure, type ActionResult } from "@/lib/action-result"
import { logger } from "@/lib/logger"
import { runAction } from "@/lib/run-action"
import { canonicalTimezone } from "@/lib/timezones"
import {
  createWorkspaceSchema,
  updateWorkspaceProfileSchema,
  updateWorkspaceSchema,
} from "./schemas"
import { createWorkspace, updateWorkspace, updateWorkspaceProfile } from "./server/mutations"
import { requireWorkspaceAccess } from "./server/queries"
import type { WorkspaceProfile } from "./types"

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
