import type { Metadata } from "next"
import type { ReactNode } from "react"
import { requireUser } from "@/features/auth/server/session"

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

/**
 * Everything signed-in. `requireUser` here is a first gate; each page, data
 * function and action re-checks (layouts don't re-render on client
 * navigation), and RLS enforces tenant isolation underneath. The workspace
 * shell lives in w/[workspaceSlug]/layout.tsx, since it needs a workspace.
 */
export default async function AuthenticatedLayout({ children }: { children: ReactNode }) {
  await requireUser()
  return children
}
