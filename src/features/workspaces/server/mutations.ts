import "server-only"

import { AppError } from "@/lib/errors"
import { createClient } from "@/lib/supabase/server"
import type { AssignableMemberRole } from "../lib/members"
import {
  ownershipRefusalError,
  toLeaveError,
  toMemberWriteError,
  toOwnershipWriteError,
  type OwnershipRefusal,
} from "../lib/member-errors"
import { toWorkspaceWriteError } from "../lib/write-errors"
import type { WorkspaceProfile } from "../types"

/**
 * Workspace writes, as the signed-in user. Callers validate input and check
 * access first; RLS and constraints enforce the same rules again underneath.
 */

export type WorkspaceIdentity = { id: string; name: string; slug: string }

/**
 * Creates a workspace owned by the caller via the create_workspace() RPC,
 * which adds the owner membership in the same transaction. Without a slug,
 * the database generates a unique one from the name; without a time zone,
 * it uses UTC. The result is always a top-level (agency) workspace.
 */
export async function createWorkspace(input: {
  name: string
  slug?: string | undefined
  timezone?: string | undefined
}): Promise<WorkspaceIdentity> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("create_workspace", {
    p_name: input.name,
    ...(input.slug ? { p_slug: input.slug } : {}),
    ...(input.timezone ? { p_timezone: input.timezone } : {}),
  })
  if (error) throw toWorkspaceWriteError(error)
  return { id: data.id, name: data.name, slug: data.slug }
}

/** Renames a workspace and/or changes its URL. Requires admin (RLS). */
export async function updateWorkspace(
  workspaceId: string,
  input: { name: string; slug: string }
): Promise<WorkspaceIdentity> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("workspaces")
    .update({ name: input.name, slug: input.slug })
    .eq("id", workspaceId)
    .select("id, name, slug")
    .maybeSingle()

  if (error) throw toWorkspaceWriteError(error)
  if (!data) {
    // RLS filtered the row out: the caller lost access since the check.
    throw new AppError("FORBIDDEN", "Only workspace owners and admins can change these settings.", {
      expose: true,
      context: { workspaceId },
    })
  }
  return data
}

/**
 * Saves the business profile (time zone, contact details, address, brand).
 * Requires admin (RLS; agency owners and admins qualify for their clients).
 * Only these columns are granted to users, so this can't touch the name,
 * URL or the workspace's place in the agency hierarchy.
 */
export async function updateWorkspaceProfile(
  workspaceId: string,
  profile: WorkspaceProfile
): Promise<void> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("workspaces")
    .update({
      timezone: profile.timezone,
      business_name: profile.businessName,
      business_email: profile.businessEmail,
      business_phone: profile.businessPhone,
      website_url: profile.websiteUrl,
      address_line1: profile.addressLine1,
      address_line2: profile.addressLine2,
      address_city: profile.addressCity,
      address_region: profile.addressRegion,
      address_postal_code: profile.addressPostalCode,
      address_country: profile.addressCountry,
      logo_url: profile.logoUrl,
      brand_primary_color: profile.brandPrimaryColor,
      brand_secondary_color: profile.brandSecondaryColor,
    })
    .eq("id", workspaceId)
    .select("id")
    .maybeSingle()

  if (error) throw toWorkspaceWriteError(error)
  if (!data) {
    // RLS filtered the row out: the caller lost access since the check.
    throw new AppError("FORBIDDEN", "Only workspace owners and admins can change these settings.", {
      expose: true,
      context: { workspaceId },
    })
  }
}

/** What an agency fills in for a new client. Blank optional values are null. */
export type NewClientWorkspace = {
  name: string
  slug?: string | undefined
  timezone: string
  businessName: string
  businessEmail: string | null
  businessPhone: string | null
  websiteUrl: string | null
  addressLine1: string | null
  addressLine2: string | null
  addressCity: string | null
  addressRegion: string | null
  addressPostalCode: string | null
  addressCountry: string | null
}

/**
 * Creates a client workspace under `agencyId` through create_client_workspace(),
 * which checks that the caller owns or administers that agency (the id is only
 * a reference) and writes the client with its business profile atomically.
 * Agency owners and admins reach the client through the agency; it starts with
 * no direct members and no data.
 */
export async function createClientWorkspace(
  agencyId: string,
  client: NewClientWorkspace
): Promise<WorkspaceIdentity> {
  const supabase = await createClient()
  const optional = (key: string, value: string | null | undefined) =>
    value ? { [key]: value } : {}

  const { data, error } = await supabase.rpc("create_client_workspace", {
    p_agency_id: agencyId,
    p_name: client.name,
    p_timezone: client.timezone,
    p_business_name: client.businessName,
    ...optional("p_slug", client.slug),
    ...optional("p_business_email", client.businessEmail),
    ...optional("p_business_phone", client.businessPhone),
    ...optional("p_website_url", client.websiteUrl),
    ...optional("p_address_line1", client.addressLine1),
    ...optional("p_address_line2", client.addressLine2),
    ...optional("p_address_city", client.addressCity),
    ...optional("p_address_region", client.addressRegion),
    ...optional("p_address_postal_code", client.addressPostalCode),
    ...optional("p_address_country", client.addressCountry),
  })
  // Not an agency the caller owns or administers (or no such workspace).
  if (error?.code === "42501") {
    throw new AppError("FORBIDDEN", "Only agency owners and admins can add client workspaces.", {
      expose: true,
      cause: error,
      context: { code: error.code, agencyId },
    })
  }
  if (error) throw toWorkspaceWriteError(error)
  return { id: data.id, name: data.name, slug: data.slug }
}

const noLongerMember = (workspaceId: string, userId: string) =>
  new AppError(
    "NOT_FOUND",
    "That person is no longer a member of this workspace, or you can't change their access.",
    { expose: true, context: { workspaceId, targetUserId: userId } }
  )

/**
 * Changes a member's role (to member or admin). RLS lets owners and admins do
 * it, and only owners touch owners; the last-owner trigger has the final say.
 */
export async function changeMemberRole(
  workspaceId: string,
  userId: string,
  role: AssignableMemberRole
): Promise<void> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("workspace_members")
    .update({ role })
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .select("user_id")
    .maybeSingle()

  if (error) throw toMemberWriteError(error)
  // Filtered out by RLS, or removed meanwhile.
  if (!data) throw noLongerMember(workspaceId, userId)
}

/**
 * Removes someone from a workspace. Their account, and their other
 * memberships, are untouched.
 */
export async function removeMember(workspaceId: string, userId: string): Promise<void> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("workspace_members")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .select("user_id")
    .maybeSingle()

  if (error) throw toMemberWriteError(error)
  if (!data) throw noLongerMember(workspaceId, userId)
}

/**
 * Hands ownership to a direct member: they become an owner and the caller an
 * admin, in one transaction (transfer_workspace_ownership). The database
 * checks that the caller is a direct owner and the target a direct member.
 */
export async function transferOwnership(workspaceId: string, userId: string): Promise<void> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("transfer_workspace_ownership", {
    p_workspace_id: workspaceId,
    p_new_owner_id: userId,
  })
  if (error) throw toOwnershipWriteError(error, "transfer")
  if (data !== "transferred") throw ownershipRefusalError(data as OwnershipRefusal)
}

/**
 * Makes a direct member of a client workspace an owner, keeping the caller's
 * role (make_workspace_owner: client workspaces, owners only).
 */
export async function makeOwner(workspaceId: string, userId: string): Promise<void> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("make_workspace_owner", {
    p_workspace_id: workspaceId,
    p_user_id: userId,
  })
  if (error) throw toOwnershipWriteError(error, "make_owner")
  if (data !== "granted") throw ownershipRefusalError(data as OwnershipRefusal)
}

/**
 * Removes the caller's own membership (RLS lets anyone leave). The last-owner
 * trigger refuses an agency's last owner; a client's last direct owner may go,
 * because its agency's owners keep owning it.
 */
export async function leaveWorkspace(workspaceId: string, userId: string): Promise<void> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("workspace_members")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .select("user_id")
    .maybeSingle()

  if (error) throw toLeaveError(error)
  if (!data) {
    throw new AppError("NOT_FOUND", "You're no longer a member of this workspace.", {
      expose: true,
      context: { workspaceId },
    })
  }
}
