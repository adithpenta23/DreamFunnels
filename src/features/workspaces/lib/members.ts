import { hasWorkspaceRole, type WorkspaceRole } from "./roles"
import type { WorkspaceType } from "../types"

/**
 * Who may manage whom, as pure decisions shared by the members UI and the
 * Server Actions. They mirror the RLS policies on workspace_members, which
 * stay the final word:
 *   - owners and admins manage members; plain members only see the list;
 *   - only owners act on owners (and never the last one: a database trigger);
 *   - nobody changes or removes themselves from this screen;
 *   - roles are only ever set to member or admin here: ownership isn't handed
 *     out casually (no transfer flow yet).
 */

/** Roles an owner or admin can give an existing member. */
export const ASSIGNABLE_MEMBER_ROLES = ["member", "admin"] as const
export type AssignableMemberRole = (typeof ASSIGNABLE_MEMBER_ROLES)[number]

export function canManageMembers(role: WorkspaceRole): boolean {
  return hasWorkspaceRole(role, "admin")
}

/** Agency owners and admins manage clients; clients can't have clients. */
export function canManageClients(workspace: { type: WorkspaceType; role: WorkspaceRole }): boolean {
  return workspace.type === "agency" && hasWorkspaceRole(workspace.role, "admin")
}

/**
 * Which agency's Clients page the switcher's "View all clients" opens: the
 * current agency, the current client's agency (visible only to its owners and
 * admins), or else the first agency the user manages clients in.
 */
export function clientsHomeSlug(
  current: { type: WorkspaceType; role: WorkspaceRole; slug: string },
  parent: { slug: string } | null,
  workspaces: readonly { type: WorkspaceType; role: WorkspaceRole; slug: string }[]
): string | null {
  if (canManageClients(current)) return current.slug
  if (current.type === "client" && parent) return parent.slug
  return workspaces.find((workspace) => canManageClients(workspace))?.slug ?? null
}

export type MemberActions = { canChangeRole: boolean; canRemove: boolean }

const NONE: MemberActions = { canChangeRole: false, canRemove: false }

export function memberActionsFor(
  viewer: { userId: string; role: WorkspaceRole },
  target: { userId: string; role: WorkspaceRole }
): MemberActions {
  if (viewer.userId === target.userId) return NONE
  if (!canManageMembers(viewer.role)) return NONE
  if (target.role === "owner" && viewer.role !== "owner") return NONE
  return { canChangeRole: true, canRemove: true }
}

/** What each role can do, worded for the workspace type. */
export function roleDescription(role: AssignableMemberRole, type: WorkspaceType): string {
  if (role === "admin") {
    return type === "agency"
      ? "Manages this workspace, its members and every client workspace."
      : "Manages this workspace's settings and members."
  }
  return type === "agency"
    ? "Works in this workspace. No access to client workspaces unless added to them."
    : "Works in this workspace."
}
