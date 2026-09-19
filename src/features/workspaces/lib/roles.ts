import { Constants, type Enums } from "@/types/database.types"

export type WorkspaceRole = Enums<"workspace_role">

/**
 * Roles in ascending order of privilege, mirroring the `workspace_role` enum
 * declaration order in the database (which RLS helpers rely on).
 */
export const WORKSPACE_ROLES = Constants.public.Enums.workspace_role

export function hasWorkspaceRole(actual: WorkspaceRole, required: WorkspaceRole): boolean {
  return WORKSPACE_ROLES.indexOf(actual) >= WORKSPACE_ROLES.indexOf(required)
}

export const WORKSPACE_ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
}
