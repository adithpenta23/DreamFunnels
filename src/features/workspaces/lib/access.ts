import { hasWorkspaceRole, type WorkspaceRole } from "./roles"

/**
 * Pure authorization decisions for workspaces. The server guards in
 * ../server/queries.ts load the caller's membership (through RLS) and act on
 * these decisions; keeping the rules here makes them unit-testable.
 */

export type WorkspaceAccess =
  | { ok: true }
  | {
      ok: false
      /**
       * `not_found`: not a member, or no such workspace. Deliberately the same
       * answer, so outsiders can't probe which workspaces exist.
       * `forbidden`: a member without the required role.
       */
      reason: "not_found" | "forbidden"
    }

export function authorizeWorkspaceAccess(
  membership: { role: WorkspaceRole } | null,
  minimumRole: WorkspaceRole
): WorkspaceAccess {
  if (!membership) return { ok: false, reason: "not_found" }
  if (!hasWorkspaceRole(membership.role, minimumRole)) return { ok: false, reason: "forbidden" }
  return { ok: true }
}

/** Who may change workspace settings (name, URL). Mirrors the RLS update policy. */
export function canManageWorkspace(role: WorkspaceRole): boolean {
  return hasWorkspaceRole(role, "admin")
}
