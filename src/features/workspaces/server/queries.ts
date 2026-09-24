import "server-only"

import { cookies } from "next/headers"
import { notFound } from "next/navigation"
import { cache } from "react"
import { requireUser } from "@/features/auth/server/session"
import { AppError } from "@/lib/errors"
import { createClient } from "@/lib/supabase/server"
import { authorizeWorkspaceAccess } from "../lib/access"
import { clientSearchFilter } from "../lib/client-search"
import { LAST_WORKSPACE_COOKIE, parseLastWorkspace } from "../lib/last-workspace"
import type { WorkspaceRole } from "../lib/roles"
import { WORKSPACE_SLUG_PATTERN } from "../lib/slug"
import type {
  ClientSummary,
  WorkspaceMember,
  WorkspaceProfile,
  WorkspaceSummary,
  WorkspaceType,
} from "../types"

/**
 * Workspace data access. Every function authenticates first and queries with
 * the user's own Supabase client, so RLS is the final word on what is visible:
 * the workspaces a user belongs to, plus (for agency owners and admins) their
 * agency's client workspaces.
 */

export type { ClientSummary, WorkspaceMember, WorkspaceProfile, WorkspaceSummary }

// `viewer_role` is a computed field (public.viewer_role): the caller's
// effective role, direct or inherited from the parent agency.
const WORKSPACE_SUMMARY =
  "id, name, slug, created_at, workspace_type, parent_workspace_id, viewer_role" as const
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Clients shown in the workspace switcher; the rest are on the Clients page. */
export const SWITCHER_CLIENT_LIMIT = 20
/** Rows per page on the Clients page. */
export const CLIENTS_PAGE_SIZE = 25

type WorkspaceRow = {
  id: string
  name: string
  slug: string
  created_at: string
  workspace_type: WorkspaceType
  parent_workspace_id: string | null
  viewer_role: WorkspaceRole | null
}

function toSummary(row: WorkspaceRow | null): WorkspaceSummary | null {
  if (!row?.viewer_role) return null
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    role: row.viewer_role,
    type: row.workspace_type,
    parentId: row.parent_workspace_id,
    createdAt: row.created_at,
  }
}

function loadFailed(what: string, error: { code: string }) {
  return new AppError("INTERNAL", `Failed to load ${what}`, {
    cause: error,
    context: { code: error.code },
  })
}

/**
 * The workspaces for the switcher: every agency-level workspace the caller
 * belongs to (oldest first), then up to SWITCHER_CLIENT_LIMIT client
 * workspaces by name. An agency with hundreds of clients never loads them all
 * here; `moreClients` says there are others to find on the Clients page.
 */
export const listSwitcherWorkspaces = cache(
  async (): Promise<{ workspaces: WorkspaceSummary[]; moreClients: boolean }> => {
    await requireUser()
    const supabase = await createClient()

    const [agencies, clients] = await Promise.all([
      supabase
        .from("workspaces")
        .select(WORKSPACE_SUMMARY)
        .eq("workspace_type", "agency")
        .order("created_at", { ascending: true }),
      supabase
        .from("workspaces")
        .select(WORKSPACE_SUMMARY)
        .eq("workspace_type", "client")
        .order("name", { ascending: true })
        .limit(SWITCHER_CLIENT_LIMIT + 1),
    ])
    if (agencies.error) throw loadFailed("workspaces", agencies.error)
    if (clients.error) throw loadFailed("client workspaces", clients.error)

    return {
      workspaces: [
        ...agencies.data.flatMap((row) => toSummary(row) ?? []),
        ...clients.data.slice(0, SWITCHER_CLIENT_LIMIT).flatMap((row) => toSummary(row) ?? []),
      ],
      moreClients: clients.data.length > SWITCHER_CLIENT_LIMIT,
    }
  }
)

/**
 * The caller's oldest workspace, or null when they have none (they need
 * onboarding, or haven't accepted an invitation yet).
 */
export const getFirstWorkspace = cache(async (): Promise<WorkspaceSummary | null> => {
  await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("workspaces")
    .select(WORKSPACE_SUMMARY)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) throw loadFailed("workspaces", error)
  return toSummary(data)
})

/**
 * Where to go after leaving a workspace: the caller's oldest remaining
 * workspace other than `excludeId` (never the one just left, even if access
 * to it remains through an agency), or null (onboarding). Not memoised: it
 * runs after a write in the same request.
 */
export async function findLandingWorkspace(excludeId: string): Promise<WorkspaceSummary | null> {
  await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("workspaces")
    .select(WORKSPACE_SUMMARY)
    .neq("id", excludeId)
    .order("workspace_type", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) throw loadFailed("workspaces", error)
  return toSummary(data)
}

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
 * The agency that manages a client workspace, if the caller can see it (agency
 * owners and admins can; the client's own members can't, by design).
 */
export async function getVisibleParentAgency(
  workspace: Pick<WorkspaceSummary, "type" | "parentId">
): Promise<WorkspaceSummary | null> {
  if (workspace.type !== "client" || !workspace.parentId) return null
  return getWorkspaceById(workspace.parentId)
}

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
      "timezone, business_name, business_email, business_phone, website_url, address_line1, address_line2, address_city, address_region, address_postal_code, address_country, logo_url, brand_primary_color, brand_secondary_color"
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
    websiteUrl: data.website_url,
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
 * One page of an agency's clients, by name, with member and invitation counts
 * (computed fields, so it's one query however many clients there are). The
 * search matches name, business name, business email and phone
 * (lib/client-search.ts). Call it after checking the caller manages clients;
 * RLS applies regardless.
 */
export async function listClients(
  agencyId: string,
  options: { page: number; search?: string | undefined }
): Promise<{ clients: ClientSummary[]; total: number }> {
  await requireUser()
  const supabase = await createClient()
  const from = (options.page - 1) * CLIENTS_PAGE_SIZE

  let query = supabase
    .from("workspaces")
    .select(
      "id, name, slug, business_name, business_email, business_phone, timezone, created_at, member_count, pending_invitation_count",
      { count: "exact" }
    )
    .eq("parent_workspace_id", agencyId)
    .eq("workspace_type", "client")
  if (options.search) query = query.or(clientSearchFilter(options.search))

  const { data, error, count } = await query
    .order("name", { ascending: true })
    .order("id", { ascending: true })
    .range(from, from + CLIENTS_PAGE_SIZE - 1)

  if (error) throw loadFailed("clients", error)
  return {
    total: count ?? data.length,
    clients: data.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      businessName: row.business_name,
      businessEmail: row.business_email,
      businessPhone: row.business_phone,
      timezone: row.timezone,
      createdAt: row.created_at,
      memberCount: row.member_count ?? 0,
      pendingInvitationCount: row.pending_invitation_count ?? 0,
    })),
  }
}

/** Direct members of a workspace, oldest first. Every member may see the list (RLS). */
export const listWorkspaceMembers = cache(
  async (workspaceId: string): Promise<WorkspaceMember[]> => {
    await requireUser()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("workspace_members")
      .select("user_id, role, created_at, profile:profiles(full_name, email)")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true })

    if (error) throw loadFailed("members", error)
    return data.map((row) => ({
      userId: row.user_id,
      role: row.role,
      joinedAt: row.created_at,
      fullName: row.profile?.full_name ?? null,
      email: row.profile?.email ?? null,
    }))
  }
)

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
  minimumRole: WorkspaceRole,
  forbiddenMessage = "Only workspace owners and admins can change these settings."
): Promise<WorkspaceSummary> {
  const workspace = await getWorkspaceById(workspaceId)
  const access = authorizeWorkspaceAccess(workspace, minimumRole)
  if (!access.ok || !workspace) {
    const notFoundError = !access.ok && access.reason === "not_found"
    throw new AppError(
      notFoundError ? "NOT_FOUND" : "FORBIDDEN",
      notFoundError
        ? "This workspace doesn't exist, or you don't have access to it."
        : forbiddenMessage,
      { expose: true, context: { workspaceId, required: minimumRole, actual: workspace?.role } }
    )
  }
  return workspace
}

/**
 * Where a signed-in user should land: their last-used workspace on this
 * device if they can still open it, else their oldest one, else null (they
 * need onboarding). Two small queries, however many clients an agency has.
 */
export async function resolveDefaultWorkspace(): Promise<WorkspaceSummary | null> {
  const user = await requireUser()
  const cookieStore = await cookies()
  const preferredSlug = parseLastWorkspace(cookieStore.get(LAST_WORKSPACE_COOKIE)?.value, user.id)
  const preferred = preferredSlug ? await getWorkspaceBySlug(preferredSlug) : null
  return preferred ?? (await getFirstWorkspace())
}
