import { Building2Icon, LockIcon, PlusIcon, SearchIcon } from "lucide-react"
import type { Metadata } from "next"
import Form from "next/form"
import Link from "next/link"
import { notFound } from "next/navigation"
import { EmptyState } from "@/components/feedback/empty-state"
import { PageHeader } from "@/components/layout/page-header"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { routes } from "@/config/routes"
import { ClientList, type ClientRow } from "@/features/workspaces/components/client-list"
import { canManageClients } from "@/features/workspaces/lib/members"
import { clientListParamsSchema } from "@/features/workspaces/schemas"
import {
  CLIENTS_PAGE_SIZE,
  getWorkspaceProfile,
  listClients,
  requireWorkspaceMember,
} from "@/features/workspaces/server/queries"
import { timezoneLabel } from "@/lib/timezones"

export const metadata: Metadata = { title: "Clients" }

/**
 * An agency's client workspaces, for its owners and admins. Search (?q=) and
 * paging (?page=) live in the URL; each page is one query including member
 * counts. Client workspaces have no clients of their own (404).
 */
export default async function ClientsPage({
  params,
  searchParams,
}: PageProps<"/w/[workspaceSlug]/clients">) {
  const { workspaceSlug } = await params
  const workspace = await requireWorkspaceMember(workspaceSlug)
  if (workspace.type !== "agency") notFound()

  if (!canManageClients(workspace)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Clients" />
        <EmptyState
          icon={LockIcon}
          title="Only owners and admins manage clients"
          description={`Ask an owner or admin of ${workspace.name} to give you access to a client workspace.`}
        />
      </div>
    )
  }

  const { q: search, page } = clientListParamsSchema.parse(await searchParams)
  const [{ clients, total }, profile] = await Promise.all([
    listClients(workspace.id, { page, search }),
    getWorkspaceProfile(workspace.id),
  ])

  const date = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: profile.timezone })
  const now = new Date()
  const rows: ClientRow[] = clients.map((client) => ({
    ...client,
    createdLabel: date.format(new Date(client.createdAt)),
    timezoneLabel: timezoneLabel(client.timezone, now),
  }))

  const pageCount = Math.max(1, Math.ceil(total / CLIENTS_PAGE_SIZE))
  const first = total === 0 ? 0 : (page - 1) * CLIENTS_PAGE_SIZE + 1
  const last = Math.min(page * CLIENTS_PAGE_SIZE, total)
  const pageHref = (target: number) => {
    const query = new URLSearchParams()
    if (search) query.set("q", search)
    if (target > 1) query.set("page", String(target))
    const suffix = query.toString()
    return `${routes.clients(workspace.slug)}${suffix ? `?${suffix}` : ""}` as ReturnType<
      typeof routes.clients
    >
  }
  const addClient = (
    <Link href={routes.newClient(workspace.slug)} className={buttonVariants()}>
      <PlusIcon aria-hidden />
      Add client
    </Link>
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clients"
        description={`Client workspaces managed by ${workspace.name}. Its owners and admins can open every one of them.`}
        actions={addClient}
      />

      {total === 0 && !search ? (
        <EmptyState
          icon={Building2Icon}
          title="No clients yet"
          description="Create your first client workspace. Each client gets its own settings, members and data, separate from your agency's."
          action={addClient}
        />
      ) : (
        <Card>
          <CardContent className="grid gap-4">
            <Form
              role="search"
              className="flex max-w-md items-center gap-2"
              action={routes.clients(workspace.slug)}
            >
              <label htmlFor="client-search" className="sr-only">
                Search clients by name
              </label>
              <div className="relative flex-1">
                <SearchIcon
                  className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  id="client-search"
                  name="q"
                  type="search"
                  defaultValue={search ?? ""}
                  placeholder="Search clients"
                  className="pl-8"
                  maxLength={80}
                />
              </div>
              <button type="submit" className={buttonVariants({ variant: "outline" })}>
                Search
              </button>
            </Form>

            {rows.length > 0 ? (
              <ClientList clients={rows} />
            ) : (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <p className="font-medium">No clients match “{search}”</p>
                <Link
                  href={routes.clients(workspace.slug)}
                  className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  Clear search
                </Link>
              </div>
            )}

            {total > CLIENTS_PAGE_SIZE ? (
              <nav
                aria-label="Client pages"
                className="flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-sm"
              >
                <p className="text-muted-foreground">
                  Showing {first}–{last} of {total}
                </p>
                <div className="flex gap-2">
                  {page > 1 ? (
                    <Link
                      href={pageHref(page - 1)}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      Previous
                    </Link>
                  ) : null}
                  {page < pageCount ? (
                    <Link
                      href={pageHref(page + 1)}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      Next
                    </Link>
                  ) : null}
                </div>
              </nav>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
