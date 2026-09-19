import { CircleCheckIcon, CircleDashedIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { PageHeader } from "@/components/layout/page-header"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { WORKSPACE_NAV } from "@/config/navigation"
import { routes } from "@/config/routes"
import { getCurrentProfile } from "@/features/account/server/profile"
import { WORKSPACE_ROLE_LABELS } from "@/features/workspaces/lib/roles"
import { requireWorkspaceMember } from "@/features/workspaces/server/queries"

/**
 * Workspace home, and the template for every tenant-scoped page: resolve the
 * slug through requireWorkspaceMember first, then load data scoped to
 * workspace.id.
 */
export async function generateMetadata({
  params,
}: PageProps<"/w/[workspaceSlug]">): Promise<Metadata> {
  const { workspaceSlug } = await params
  const workspace = await requireWorkspaceMember(workspaceSlug)
  return { title: workspace.name }
}

export default async function WorkspaceDashboardPage({ params }: PageProps<"/w/[workspaceSlug]">) {
  const { workspaceSlug } = await params
  const [workspace, profile] = await Promise.all([
    requireWorkspaceMember(workspaceSlug),
    getCurrentProfile(),
  ])
  const firstName = profile.fullName?.trim().split(/\s+/)[0]

  const steps = [
    { label: "Create your account", done: true },
    { label: `Set up ${workspace.name}`, done: true },
    { label: "Build your first funnel", done: false },
    { label: "Connect your domain", done: false },
    { label: "Invite your team", done: false },
  ]
  const completed = steps.filter((step) => step.done).length
  const upcoming = WORKSPACE_NAV.filter((item) => !item.href)

  return (
    <div className="space-y-8">
      <PageHeader
        title={workspace.name}
        description={
          firstName
            ? `Welcome, ${firstName}. This is the home of your funnels, leads and results.`
            : "This is the home of your funnels, leads and results."
        }
        actions={<Badge variant="outline">{WORKSPACE_ROLE_LABELS[workspace.role]}</Badge>}
      />

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Get started</h2>
          </CardTitle>
          <CardDescription>
            {completed} of {steps.length} done. Building funnels arrives in the next release.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-3">
            {steps.map((step) => (
              <li key={step.label} className="flex items-center gap-3 text-sm">
                {step.done ? (
                  <CircleCheckIcon className="size-4 shrink-0 text-emerald-600" aria-hidden />
                ) : (
                  <CircleDashedIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                )}
                <span className={step.done ? "text-muted-foreground line-through" : undefined}>
                  {step.label}
                </span>
                <span className="sr-only">{step.done ? "(done)" : "(to do)"}</span>
                {!step.done ? (
                  <Badge variant="secondary" className="ml-auto">
                    Soon
                  </Badge>
                ) : null}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <section aria-labelledby="modules-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="space-y-1">
            <h2 id="modules-heading" className="font-semibold">
              Coming to your workspace
            </h2>
            <p className="text-sm text-muted-foreground">
              Each module lands here as it ships. Your workspace is ready for them.
            </p>
          </div>
          <Link
            href={routes.workspaceSettings(workspace.slug)}
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Workspace settings
          </Link>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {upcoming.map(({ id, label, description, icon: Icon }) => (
            <li key={id}>
              <Card size="sm" className="h-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Icon className="size-4 text-muted-foreground" aria-hidden />
                    <h3>{label}</h3>
                    <Badge variant="secondary" className="ml-auto">
                      Soon
                    </Badge>
                  </CardTitle>
                  <CardDescription>{description}</CardDescription>
                </CardHeader>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
