"use client"

import { createContext, use, type ReactNode } from "react"
import type { WorkspaceSummary } from "@/features/workspaces/types"

/**
 * The authenticated application context: who is signed in and which workspace
 * they're in, for Client Components (switcher, menus, future editors).
 *
 * It's filled by the workspace layout from server-verified data, and it's for
 * rendering only. Server Actions never trust it: they re-authenticate and
 * re-check workspace access themselves.
 */
export type CurrentUser = {
  id: string
  email: string | null
  fullName: string | null
}

export type AppContextValue = {
  user: CurrentUser
  /** The workspace in the URL. `workspace.id` scopes everything tenant-owned. */
  workspace: WorkspaceSummary
  /**
   * Workspaces for the switcher: every agency-level workspace the user belongs
   * to, then their first client workspaces by name (capped; see moreClients).
   */
  workspaces: WorkspaceSummary[]
  /** More client workspaces exist than the switcher lists (see the Clients page). */
  moreClients: boolean
  /**
   * The agency managing the current workspace, when it is a client and the
   * user can see that agency (agency owners and admins). Null otherwise.
   */
  parentWorkspace: { name: string; slug: string } | null
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppContextProvider({
  value,
  children,
}: {
  value: AppContextValue
  children: ReactNode
}) {
  return <AppContext value={value}>{children}</AppContext>
}

export function useAppContext(): AppContextValue {
  const context = use(AppContext)
  if (!context) {
    throw new Error("useAppContext must be used inside a workspace (AppContextProvider)")
  }
  return context
}

export const useCurrentUser = () => useAppContext().user
export const useCurrentWorkspace = () => useAppContext().workspace

/** Initials for avatars: "Ada Lovelace" -> "AL", "founder@x.com" -> "F". */
export function initialsOf(name: string | null, fallback: string | null): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean)
  if (words.length > 0) {
    return words
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase()
  }
  return (fallback?.trim()[0] ?? "?").toUpperCase()
}
