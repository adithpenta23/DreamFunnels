import type { AppContextValue } from "@/components/providers/app-context"
import type { WorkspaceSummary } from "@/features/workspaces/types"

/** Shared, obviously fake fixtures for component tests. */

export const acmeWorkspace: WorkspaceSummary = {
  id: "6f1c1d0e-1a2b-4c3d-8e9f-0a1b2c3d4e5f",
  name: "Acme Rockets",
  slug: "acme",
  role: "owner",
  type: "agency",
  parentId: null,
  createdAt: "2026-09-18T10:00:00.000Z",
}

export const betaWorkspace: WorkspaceSummary = {
  id: "0b0b0b0b-1a2b-4c3d-8e9f-0a1b2c3d4e5f",
  name: "Beta Labs",
  slug: "beta-labs",
  role: "member",
  type: "agency",
  parentId: null,
  createdAt: "2026-09-18T11:00:00.000Z",
}

export const appContext: AppContextValue = {
  user: { id: "u-1", email: "ada@example.com", fullName: "Ada Lovelace" },
  workspace: acmeWorkspace,
  workspaces: [acmeWorkspace, betaWorkspace],
  moreClients: false,
  parentWorkspace: null,
}
