import { PageHeader } from "@/components/layout/page-header"
import { SettingsNav } from "@/components/layout/settings-nav"
import { canManageMembers } from "@/features/workspaces/lib/members"
import { requireWorkspaceMember } from "@/features/workspaces/server/queries"

export default async function SettingsLayout({
  children,
  params,
}: LayoutProps<"/w/[workspaceSlug]/settings">) {
  const { workspaceSlug } = await params
  const workspace = await requireWorkspaceMember(workspaceSlug)

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description={`Manage ${workspace.name} and your account.`} />
      <SettingsNav workspaceSlug={workspace.slug} showAuditLog={canManageMembers(workspace.role)} />
      {children}
    </div>
  )
}
