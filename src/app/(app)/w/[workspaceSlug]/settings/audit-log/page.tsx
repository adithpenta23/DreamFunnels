import { HistoryIcon, LockIcon } from "lucide-react"
import type { Metadata, Route } from "next"
import Link from "next/link"
import { EmptyState } from "@/components/feedback/empty-state"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { routes } from "@/config/routes"
import { AuditLogFilters } from "@/features/audit-log/components/audit-log-filters"
import { AuditLogTable, type AuditLogRow } from "@/features/audit-log/components/audit-log-table"
import { describeAuditEvent } from "@/features/audit-log/lib/events"
import { parseAuditLogParams, type AuditLogParams } from "@/features/audit-log/schemas"
import { listAuditEvents } from "@/features/audit-log/server/queries"
import { canManageMembers } from "@/features/workspaces/lib/members"
import {
  getWorkspaceProfile,
  listWorkspaceMembers,
  requireWorkspaceMember,
} from "@/features/workspaces/server/queries"
import { timezoneLabel } from "@/lib/timezones"

export const metadata: Metadata = { title: "Audit log" }

/**
 * Who changed what in this workspace: memberships, invitations, ownership and
 * (for agencies) new clients. Owners and admins only; members opening the URL
 * are told why they can't see it. Filters and the page cursor live in the URL.
 */
export default async function AuditLogPage({
  params,
  searchParams,
}: PageProps<"/w/[workspaceSlug]/settings/audit-log">) {
  const { workspaceSlug } = await params
  const workspace = await requireWorkspaceMember(workspaceSlug)

  if (!canManageMembers(workspace.role)) {
    return (
      <EmptyState
        icon={LockIcon}
        title="Only owners and admins can view the audit log"
        description={`The audit log records changes to members, invitations and ownership. Ask an owner or admin of ${workspace.name} if you need to know what changed.`}
      />
    )
  }

  const { params: filters, dateError } = parseAuditLogParams(await searchParams)
  const [profile, members, page] = await Promise.all([
    getWorkspaceProfile(workspace.id),
    listWorkspaceMembers(workspace.id),
    dateError
      ? Promise.resolve({ events: [], olderCursor: null })
      : listAuditEvents(workspace.id, filters),
  ])

  const format = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: profile.timezone,
  })
  const rows: AuditLogRow[] = page.events.map((event) => ({
    ...describeAuditEvent(event),
    key: event.id,
    dateTime: event.createdAt,
    dateLabel: format.format(new Date(event.createdAt)),
  }))
  const actors = members.map((member) => ({
    userId: member.userId,
    name: member.fullName?.trim() || member.email || "Unnamed member",
  }))

  const base = routes.auditLog(workspace.slug)
  const hrefWith = (overrides: Partial<AuditLogParams>) => {
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries({ ...filters, before: undefined, ...overrides })) {
      if (value) query.set(key, value)
    }
    const suffix = query.toString()
    return `${base}${suffix ? `?${suffix}` : ""}` as Route
  }
  const filtered = Boolean(filters.action || filters.actor || filters.from || filters.to)

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Audit log</h2>
        </CardTitle>
        <CardDescription>
          Changes to members, invitations and ownership in {workspace.name}, newest first. Times are
          in {timezoneLabel(profile.timezone, new Date())}. Events are kept for a year.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <AuditLogFilters action={base} params={filters} actors={actors} dateError={dateError} />

        {rows.length > 0 ? (
          <AuditLogTable rows={rows} caption={`Audit log of ${workspace.name}`} />
        ) : filtered || filters.before ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <p className="font-medium">
              {dateError ? "Fix the dates to see events" : "No events match these filters"}
            </p>
            <Link
              href={base}
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Show all events
            </Link>
          </div>
        ) : (
          <EmptyState
            icon={HistoryIcon}
            title="No activity yet"
            description="Workspace changes and security-sensitive actions will appear here."
          />
        )}

        {page.olderCursor || filters.before ? (
          <nav
            aria-label="Audit log pages"
            className="flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-sm"
          >
            {filters.before ? (
              <Link
                href={hrefWith({})}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Newest events
              </Link>
            ) : (
              <span />
            )}
            {page.olderCursor ? (
              <Link
                href={hrefWith({ before: page.olderCursor })}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Older events
              </Link>
            ) : null}
          </nav>
        ) : null}
      </CardContent>
    </Card>
  )
}
