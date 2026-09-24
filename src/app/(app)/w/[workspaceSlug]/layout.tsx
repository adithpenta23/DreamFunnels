import { AppShell } from "@/components/layout/app-shell"
import { AppContextProvider } from "@/components/providers/app-context"
import { getCurrentProfile } from "@/features/account/server/profile"
import { RememberWorkspace } from "@/features/workspaces/components/remember-workspace"
import {
  getVisibleParentAgency,
  listSwitcherWorkspaces,
  requireWorkspaceMember,
} from "@/features/workspaces/server/queries"

/**
 * The workspace shell. Resolves the workspace from the URL (404 for
 * non-members, so existence isn't leaked) and hands the verified user and
 * workspace to Client Components through the app context.
 *
 * Pages below still call requireWorkspaceMember() themselves: this layout
 * doesn't re-run when navigating between them.
 */
export default async function WorkspaceLayout({
  children,
  params,
}: LayoutProps<"/w/[workspaceSlug]">) {
  const { workspaceSlug } = await params
  const workspace = await requireWorkspaceMember(workspaceSlug)
  const [{ workspaces, moreClients }, profile, parent] = await Promise.all([
    listSwitcherWorkspaces(),
    getCurrentProfile(),
    getVisibleParentAgency(workspace),
  ])

  return (
    <AppContextProvider
      value={{
        user: { id: profile.id, email: profile.email, fullName: profile.fullName },
        workspace,
        workspaces,
        moreClients,
        parentWorkspace: parent ? { name: parent.name, slug: parent.slug } : null,
      }}
    >
      <RememberWorkspace userId={profile.id} slug={workspace.slug} />
      <AppShell>{children}</AppShell>
    </AppContextProvider>
  )
}
