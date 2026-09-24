import "server-only"

import { cache } from "react"
import { requireUser } from "@/features/auth/server/session"
import { AppError } from "@/lib/errors"
import { createClient } from "@/lib/supabase/server"
import { isWellFormedInvitationToken } from "../lib/tokens"
import type { InvitableRole } from "../schemas"
import type { InvitationPreview, OpenInvitation } from "../types"
import { hashInvitationToken } from "./tokens"

/**
 * The public preview behind /invite/<token>. Works signed in or out (the
 * function is callable by anon); anyone holding the token may see it, which is
 * the point of the link. Null for malformed, unknown or random tokens alike.
 */
export const getInvitationPreview = cache(
  async (token: string): Promise<InvitationPreview | null> => {
    if (!isWellFormedInvitationToken(token)) return null

    const supabase = await createClient()
    const { data, error } = await supabase.rpc("get_workspace_invitation", {
      p_token_hash: hashInvitationToken(token),
    })
    if (error) {
      throw new AppError("INTERNAL", "Failed to load invitation", {
        cause: error,
        context: { code: error.code },
      })
    }
    const row = data[0]
    if (!row) return null
    return {
      status: row.status as InvitationPreview["status"],
      email: row.email,
      role: row.role as InvitableRole,
      workspaceName: row.workspace_name,
      inviterName: row.inviter_name,
      expiresAt: row.expires_at,
      workspaceSlug: row.workspace_slug,
    }
  }
)

/** The address of an open invitation in this workspace (owners and admins only, by RLS). */
export async function findOpenInvitationEmail(
  workspaceId: string,
  invitationId: string
): Promise<string | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("workspace_invitations")
    .select("email")
    .eq("workspace_id", workspaceId)
    .eq("id", invitationId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .maybeSingle()
  if (error) {
    throw new AppError("INTERNAL", "Failed to load invitation", {
      cause: error,
      context: { code: error.code },
    })
  }
  return data?.email ?? null
}

/**
 * Open (not accepted, not revoked) invitations of a workspace, newest first,
 * expired ones included so they can be resent. RLS returns nothing to members
 * below admin; callers check the role first anyway.
 */
export const listOpenInvitations = cache(async (workspaceId: string): Promise<OpenInvitation[]> => {
  await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("workspace_invitations")
    .select("id, email, role, expires_at, created_at, last_sent_at, delivery_status")
    .eq("workspace_id", workspaceId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })

  if (error) {
    throw new AppError("INTERNAL", "Failed to load invitations", {
      cause: error,
      context: { code: error.code },
    })
  }
  return data.map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role as InvitableRole,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    lastSentAt: row.last_sent_at,
    deliveryStatus: row.delivery_status as OpenInvitation["deliveryStatus"],
  }))
})
