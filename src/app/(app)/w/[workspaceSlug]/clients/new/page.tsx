import { LockIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { EmptyState } from "@/components/feedback/empty-state"
import { PageHeader } from "@/components/layout/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { routes } from "@/config/routes"
import { CreateClientForm } from "@/features/workspaces/components/create-client-form"
import { canManageClients } from "@/features/workspaces/lib/members"
import { getWorkspaceProfile, requireWorkspaceMember } from "@/features/workspaces/server/queries"
import { countryOptions } from "@/lib/countries"
import { timezoneOptions } from "@/lib/timezones"

export const metadata: Metadata = { title: "Add a client" }

export default async function NewClientPage({
  params,
}: PageProps<"/w/[workspaceSlug]/clients/new">) {
  const { workspaceSlug } = await params
  const workspace = await requireWorkspaceMember(workspaceSlug)
  if (workspace.type !== "agency") notFound()

  if (!canManageClients(workspace)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Add a client" />
        <EmptyState
          icon={LockIcon}
          title="Only owners and admins add clients"
          description={`Ask an owner or admin of ${workspace.name} to add the client for you.`}
        />
      </div>
    )
  }

  const profile = await getWorkspaceProfile(workspace.id)

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link
          href={routes.clients(workspace.slug)}
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          ← Clients
        </Link>
        <PageHeader
          title="Add a client"
          description={`Create a workspace for a business ${workspace.name} works for. It gets its own settings, members and data.`}
        />
      </div>
      <Card>
        <CardContent>
          <CreateClientForm
            agency={{ id: workspace.id, name: workspace.name, slug: workspace.slug }}
            defaultTimezone={profile.timezone}
            timezoneOptions={timezoneOptions()}
            countryOptions={countryOptions()}
          />
        </CardContent>
      </Card>
    </div>
  )
}
