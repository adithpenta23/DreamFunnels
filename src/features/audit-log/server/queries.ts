import "server-only"

import { requireUser } from "@/features/auth/server/session"
import { AppError } from "@/lib/errors"
import { createClient } from "@/lib/supabase/server"
import { toAuditDetails, type AuditEvent } from "../lib/events"
import type { AuditLogParams } from "../schemas"

/** Events per page. */
export const AUDIT_LOG_PAGE_SIZE = 25

/**
 * One page of a workspace's audit log, newest first, through
 * list_workspace_audit_events() (owners and admins only: the function checks
 * the caller's role itself and raises 42501 otherwise). Asks for one extra row
 * to know whether an older page exists; its cursor is the last row's id.
 */
export async function listAuditEvents(
  workspaceId: string,
  params: AuditLogParams
): Promise<{ events: AuditEvent[]; olderCursor: string | null }> {
  await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("list_workspace_audit_events", {
    p_workspace_id: workspaceId,
    p_limit: AUDIT_LOG_PAGE_SIZE + 1,
    ...(params.before ? { p_before_id: Number(params.before) } : {}),
    ...(params.action ? { p_event_type: params.action } : {}),
    ...(params.actor ? { p_actor_id: params.actor } : {}),
    ...(params.from ? { p_from: params.from } : {}),
    ...(params.to ? { p_to: params.to } : {}),
  })

  if (error?.code === "42501") {
    throw new AppError("FORBIDDEN", "Only owners and admins can view the audit log.", {
      expose: true,
      cause: error,
      context: { workspaceId },
    })
  }
  if (error) {
    throw new AppError("INTERNAL", "Failed to load the audit log", {
      cause: error,
      context: { code: error.code, workspaceId },
    })
  }

  const rows = data.slice(0, AUDIT_LOG_PAGE_SIZE)
  const events = rows.map((row) => ({
    id: String(row.id),
    createdAt: row.created_at,
    eventType: row.event_type,
    actorName: row.actor_name,
    targetName: row.target_name,
    targetEmail: row.target_email,
    details: toAuditDetails(row.details),
  }))
  return {
    events,
    olderCursor: data.length > AUDIT_LOG_PAGE_SIZE ? (events.at(-1)?.id ?? null) : null,
  }
}
