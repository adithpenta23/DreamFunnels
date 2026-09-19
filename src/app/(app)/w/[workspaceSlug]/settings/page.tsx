import type { Metadata } from "next"
import { CopyField } from "@/components/forms/copy-field"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { WorkspaceSettingsForm } from "@/features/workspaces/components/workspace-settings-form"
import { canManageWorkspace } from "@/features/workspaces/lib/access"
import { WORKSPACE_ROLE_LABELS } from "@/features/workspaces/lib/roles"
import { requireWorkspaceMember } from "@/features/workspaces/server/queries"

export const metadata: Metadata = { title: "Workspace settings" }

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "long" })

export default async function WorkspaceSettingsPage({
  params,
}: PageProps<"/w/[workspaceSlug]/settings">) {
  const { workspaceSlug } = await params
  const workspace = await requireWorkspaceMember(workspaceSlug)

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>General</h2>
          </CardTitle>
          <CardDescription>Your workspace&apos;s name and the URL it lives at.</CardDescription>
        </CardHeader>
        <CardContent>
          <WorkspaceSettingsForm
            // Remount with fresh values if the workspace is renamed elsewhere.
            key={`${workspace.id}:${workspace.name}:${workspace.slug}`}
            workspace={workspace}
            canManage={canManageWorkspace(workspace.role)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Details</h2>
          </CardTitle>
          <CardDescription>Useful when you contact support.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid max-w-xl gap-4 text-sm">
            <div className="grid gap-2">
              <dt>
                <label htmlFor="workspace-id" className="font-medium">
                  Workspace ID
                </label>
              </dt>
              <dd>
                <CopyField id="workspace-id" value={workspace.id} label="Workspace ID" />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="font-medium">Your role</dt>
              <dd>
                <Badge variant="secondary">{WORKSPACE_ROLE_LABELS[workspace.role]}</Badge>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="font-medium">Created</dt>
              <dd className="text-muted-foreground">
                {dateFormat.format(new Date(workspace.createdAt))}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  )
}
