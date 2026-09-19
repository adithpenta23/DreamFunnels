import type { WorkspaceRole } from "./lib/roles"

/** A workspace as seen by one member: safe to pass to Client Components. */
export type WorkspaceSummary = {
  id: string
  name: string
  slug: string
  /** The viewer's role in this workspace. */
  role: WorkspaceRole
  createdAt: string
}
