import "server-only"

import { AppError } from "@/lib/errors"
import { createClient } from "@/lib/supabase/server"
import { toWorkspaceWriteError } from "../lib/write-errors"

/**
 * Workspace writes, as the signed-in user. Callers validate input and check
 * access first; RLS and constraints enforce the same rules again underneath.
 */

export type WorkspaceIdentity = { id: string; name: string; slug: string }

/**
 * Creates a workspace owned by the caller via the create_workspace() RPC,
 * which adds the owner membership in the same transaction. Without a slug,
 * the database generates a unique one from the name.
 */
export async function createWorkspace(input: {
  name: string
  slug?: string | undefined
}): Promise<WorkspaceIdentity> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    "create_workspace",
    input.slug ? { p_name: input.name, p_slug: input.slug } : { p_name: input.name }
  )
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
