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
import type { WorkspaceProfile, WorkspaceSummary } from "../types"

/**
 * Workspace data access. Every function authenticates first and queries with
 * the user's own Supabase client, so RLS is the final word on what is visible:
 * the workspaces a user belongs to, plus (for agency owners and admins) their
 * agency's client workspaces.
 */

export type { WorkspaceProfile, WorkspaceSummary }

// `viewer_role` is a computed field (public.viewer_role): the caller's
// effective role, direct or inherited from the parent agency.
const WORKSPACE_SUMMARY = "id, name, slug, created_at, viewer_role" as const
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type WorkspaceRow = {
  id: string
  name: string
  slug: string
  created_at: string
  viewer_role: WorkspaceRole | null
}

function toSummary(row: WorkspaceRow | null): WorkspaceSummary | null {
  if (!row?.viewer_role) return null
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    role: row.viewer_role,
    createdAt: row.created_at,
  }
}

function loadFailed(what: string, error: { code: string }) {
  return new AppError("INTERNAL", `Failed to load ${what}`, {
    cause: error,
    context: { code: error.code },
  })
}

/** Every workspace the caller can open, oldest first. Empty means onboarding hasn't happened. */
export const listMyWorkspaces = cache(async (): Promise<WorkspaceSummary[]> => {
  await requireUser()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("workspaces")
    .select(WORKSPACE_SUMMARY)
    .order("created_at", { ascending: true })

  if (error) throw loadFailed("workspaces", error)
  return data.flatMap((row) => toSummary(row) ?? [])
})

/** The workspace with the caller's role, or null if it doesn't exist or they have no access. */
export const getWorkspaceBySlug = cache(async (slug: string): Promise<WorkspaceSummary | null> => {
  if (!WORKSPACE_SLUG_PATTERN.test(slug)) return null

  await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("workspaces")
    .select(WORKSPACE_SUMMARY)
    .eq("slug", slug)
    .maybeSingle()

  if (error) throw loadFailed("workspace", error)
  return toSummary(data)
})

/** Like getWorkspaceBySlug, by id. Used by actions, which receive ids from forms. */
export const getWorkspaceById = cache(async (id: string): Promise<WorkspaceSummary | null> => {
  if (!UUID_PATTERN.test(id)) return null

  await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("workspaces")
    .select(WORKSPACE_SUMMARY)
    .eq("id", id)
    .maybeSingle()

  if (error) throw loadFailed("workspace", error)
  return toSummary(data)
})

/**
 * The business profile of a workspace the caller can see. Call it after
 * requireWorkspaceMember(); RLS hides other tenants' rows regardless.
 */
export const getWorkspaceProfile = cache(async (workspaceId: string): Promise<WorkspaceProfile> => {
  await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("workspaces")
    .select(
      "timezone, business_name, business_email, business_phone, address_line1, address_line2, address_city, address_region, address_postal_code, address_country, logo_url, brand_primary_color, brand_secondary_color"
    )
    .eq("id", workspaceId)
    .maybeSingle()

  if (error) throw loadFailed("workspace profile", error)
  if (!data) {
    throw new AppError("NOT_FOUND", "Workspace not found", { context: { workspaceId } })
  }
  return {
    timezone: data.timezone,
    businessName: data.business_name,
    businessEmail: data.business_email,
    businessPhone: data.business_phone,
    addressLine1: data.address_line1,
    addressLine2: data.address_line2,
    addressCity: data.address_city,
    addressRegion: data.address_region,
    addressPostalCode: data.address_postal_code,
    addressCountry: data.address_country,
    logoUrl: data.logo_url,
    brandPrimaryColor: data.brand_primary_color,
    brandSecondaryColor: data.brand_secondary_color,
  }
})

/**
 * Gate for every workspace-scoped page and layout. Callers without access get
 * a 404 (not a 403) so workspace existence is never leaked. "Access" is
 * membership, or agency owner/admin of the workspace's parent agency.
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
 * trust the id itself: this re-reads access through RLS.
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
