import "server-only"

import { cookies } from "next/headers"
import { notFound } from "next/navigation"
import { cache } from "react"
import { requireUser } from "@/features/auth/server/session"
import { AppError } from "@/lib/errors"
import { createClient } from "@/lib/supabase/server"
import { authorizeWorkspaceAccess, pickDefaultWorkspace } from "../lib/access"
import { LAST_WORKSPACE_COOKIE, parseLastWorkspace } from "../lib/last-workspace"
import type { WorkspaceRole } from "../lib/roles"
import { WORKSPACE_SLUG_PATTERN } from "../lib/slug"
import type { WorkspaceSummary } from "../types"

/**
 * Workspace data access. Every function authenticates first and queries with
 * the user's own Supabase client, so RLS is the final word on what is visible.
 * The explicit `user_id` filters narrow results to the caller's membership row;
 * they are not what provides isolation.
 */

export type { WorkspaceSummary }

const WORKSPACE_WITH_ROLE = "id, name, slug, created_at, workspace_members!inner(role)" as const
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type WorkspaceRow = {
  id: string
  name: string
  slug: string
  created_at: string
  workspace_members: { role: WorkspaceRole }[]
}

function toSummary(row: WorkspaceRow | null): WorkspaceSummary | null {
  const membership = row?.workspace_members[0]
  if (!row || !membership) return null
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    role: membership.role,
    createdAt: row.created_at,
  }
}

function loadFailed(what: string, error: { code: string }) {
  return new AppError("INTERNAL", `Failed to load ${what}`, {
    cause: error,
    context: { code: error.code },
  })
}

/** The caller's workspaces, oldest first. Empty means onboarding hasn't happened. */
export const listMyWorkspaces = cache(async (): Promise<WorkspaceSummary[]> => {
  const user = await requireUser()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("workspaces")
    .select(WORKSPACE_WITH_ROLE)
    .eq("workspace_members.user_id", user.id)
    .order("created_at", { ascending: true })

  if (error) throw loadFailed("workspaces", error)
  return data.flatMap((row) => toSummary(row) ?? [])
})

/** The workspace with the caller's role, or null if it doesn't exist or they aren't a member. */
export const getWorkspaceBySlug = cache(async (slug: string): Promise<WorkspaceSummary | null> => {
  if (!WORKSPACE_SLUG_PATTERN.test(slug)) return null

  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("workspaces")
    .select(WORKSPACE_WITH_ROLE)
    .eq("slug", slug)
    .eq("workspace_members.user_id", user.id)
    .maybeSingle()

  if (error) throw loadFailed("workspace", error)
  return toSummary(data)
})

/** Like getWorkspaceBySlug, by id. Used by actions, which receive ids from forms. */
export const getWorkspaceById = cache(async (id: string): Promise<WorkspaceSummary | null> => {
  if (!UUID_PATTERN.test(id)) return null

  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("workspaces")
    .select(WORKSPACE_WITH_ROLE)
    .eq("id", id)
    .eq("workspace_members.user_id", user.id)
    .maybeSingle()

  if (error) throw loadFailed("workspace", error)
  return toSummary(data)
})

/**
 * Gate for every workspace-scoped page and layout. Non-members get a 404
 * (not a 403) so workspace existence is never leaked.
 */
export async function requireWorkspaceMember(
  slug: string,
  minimumRole: WorkspaceRole = "member"
): Promise<WorkspaceSummary> {
  const workspace = await getWorkspaceBySlug(slug)
  const access = authorizeWorkspaceAccess(workspace, minimumRole)
  if (!access.ok && access.reason === "not_found") notFound()
  if (!access.ok || !workspace) {
    throw new AppError("FORBIDDEN", "Insufficient workspace role", {
      context: { workspaceId: workspace?.id, required: minimumRole, actual: workspace?.role },
    })
  }
  return workspace
}

/**
 * Gate for Server Actions that act on a workspace id taken from a form.
 * Throws AppErrors (not notFound) so the form can show the failure. Never
 * trust the id itself: this re-reads the membership through RLS.
 */
export async function requireWorkspaceAccess(
  workspaceId: string,
  minimumRole: WorkspaceRole
): Promise<WorkspaceSummary> {
  const workspace = await getWorkspaceById(workspaceId)
  const access = authorizeWorkspaceAccess(workspace, minimumRole)
  if (!access.ok || !workspace) {
    const notFoundError = !access.ok && access.reason === "not_found"
    throw new AppError(
      notFoundError ? "NOT_FOUND" : "FORBIDDEN",
      notFoundError
        ? "This workspace doesn't exist, or you don't have access to it."
        : "Only workspace owners and admins can change these settings.",
      { expose: true, context: { workspaceId, required: minimumRole, actual: workspace?.role } }
    )
  }
  return workspace
}

/**
 * Where a signed-in user should land: their last-used workspace on this
 * device if they still belong to it, else their oldest one, else null
 * (they need onboarding).
 */
export async function resolveDefaultWorkspace(): Promise<WorkspaceSummary | null> {
  const user = await requireUser()
  const workspaces = await listMyWorkspaces()
  const cookieStore = await cookies()
  const preferred = parseLastWorkspace(cookieStore.get(LAST_WORKSPACE_COOKIE)?.value, user.id)
  return pickDefaultWorkspace(workspaces, preferred)
}
