import { hasWorkspaceRole, type WorkspaceRole } from "./roles"
import type { WorkspaceType } from "../types"

/**
 * Who may manage whom, as pure decisions shared by the members UI and the
 * Server Actions. They mirror the RLS policies on workspace_members, which
 * stay the final word:
 *   - owners and admins manage members; plain members only see the list;
 *   - only owners act on owners (and never the last one: a database trigger);
 *   - nobody changes or removes themselves from this screen (they leave from
 *     Settings → General instead);
 *   - roles are only ever set to member or admin here. Ownership moves only
 *     through the ownership functions (ownershipActionsFor below), never as
 *     a role choice.
 *
 * `role` is always the viewer's EFFECTIVE role (direct, or inherited from
 * their agency); `directRole` is their own membership row, if any.
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

export type OwnershipActions = { canTransferOwnership: boolean; canMakeOwner: boolean }

const NO_OWNERSHIP: OwnershipActions = { canTransferOwnership: false, canMakeOwner: false }

/**
 * Ownership actions on a direct member (mirrors transfer_workspace_ownership
 * and make_workspace_owner, which decide again):
 *   - transfer: the viewer is a DIRECT owner (agency or client); they become
 *     an admin and the target the owner;
 *   - make owner: client workspaces only, for any owner (direct, or an owner
 *     of the agency), without stepping down.
 * Never on yourself or on someone who's already an owner.
 */
export function ownershipActionsFor(
  viewer: { userId: string; role: WorkspaceRole; directRole: WorkspaceRole | null },
  target: { userId: string; role: WorkspaceRole },
  workspaceType: WorkspaceType
): OwnershipActions {
  if (viewer.userId === target.userId || target.role === "owner") return NO_OWNERSHIP
  return {
    canTransferOwnership: viewer.directRole === "owner",
    canMakeOwner: workspaceType === "client" && viewer.role === "owner",
  }
}

export type LeavePolicy =
  | { canLeave: true; impact: string }
  | { canLeave: false; reason: "no_direct_membership" | "last_owner"; explanation: string }

/**
 * Whether the viewer may leave, and what it means, following the database's
 * rules (private.protect_last_owner): members and admins always may; an owner
 * may when another direct owner remains; a client's last direct owner may,
 * because its agency's owners keep owning it; an agency's last owner may not.
 */
export function leavePolicy(input: {
  workspaceName: string
  workspaceType: WorkspaceType
  directRole: WorkspaceRole | null
  /** Direct owners, the viewer included. */
  directOwnerCount: number
  /** The managing agency, when the viewer can see it. */
  agency: { name: string; role: WorkspaceRole } | null
}): LeavePolicy {
  const { workspaceName, workspaceType, directRole, directOwnerCount, agency } = input
  if (directRole === null) {
    return {
      canLeave: false,
      reason: "no_direct_membership",
      explanation: agency
        ? `You manage ${workspaceName} through ${agency.name}, so there's no membership to leave. Your access follows your role in ${agency.name}.`
        : `You aren't a member of ${workspaceName}, so there's no membership to leave.`,
    }
  }
  const lastOwner = directRole === "owner" && directOwnerCount <= 1
  if (lastOwner && workspaceType === "agency") {
    return {
      canLeave: false,
      reason: "last_owner",
      explanation: `You're the only owner of ${workspaceName}. Transfer ownership to another member first, then you can leave.`,
    }
  }

  const keepsAccess = agency !== null && hasWorkspaceRole(agency.role, "admin")
  const consequences = [
    keepsAccess
      ? `You'll still reach it as ${agency.role === "owner" ? "an owner" : "an admin"} of ${agency.name}.`
      : "You'll lose access to this workspace.",
  ]
  if (lastOwner) {
    consequences.push(
      `You're its last direct owner: ${agency ? `the owners of ${agency.name}` : "the agency that manages it"} will keep ownership.`
    )
  } else if (directRole === "owner") {
    consequences.push("The other owners keep managing it.")
  }
  return { canLeave: true, impact: consequences.join(" ") }
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
