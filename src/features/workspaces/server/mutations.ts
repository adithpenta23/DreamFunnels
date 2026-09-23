import "server-only"

import { AppError } from "@/lib/errors"
import { createClient } from "@/lib/supabase/server"
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
