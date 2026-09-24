import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { routes } from "@/config/routes"
import type { ClientSummary } from "../types"
import { ClientRowActions } from "./client-row-actions"

export type ClientRow = ClientSummary & {
  /** Formatted on the server. */
  createdLabel: string
  timezoneLabel: string
}

type ClientStatus = { label: string; variant: "secondary" | "outline" }

/** Where a client stands with its own people (agency staff aren't counted). */
export function clientStatus(
  client: Pick<ClientSummary, "memberCount" | "pendingInvitationCount">
): ClientStatus {
  if (client.memberCount > 0) return { label: "Active", variant: "secondary" }
  if (client.pendingInvitationCount > 0) return { label: "Invitation pending", variant: "outline" }
  return { label: "No members yet", variant: "outline" }
}

/**
 * An agency's clients. A table on wide screens; on phones the secondary
 * columns fold into the first cell so nothing scrolls sideways.
 */
export function ClientList({ clients }: { clients: readonly ClientRow[] }) {
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">Client workspaces</caption>
      <thead className="border-b text-left text-xs text-muted-foreground">
        <tr>
          <th scope="col" className="pb-2 font-medium">
            Client
          </th>
          <th scope="col" className="hidden pb-2 font-medium sm:table-cell">
            Status
          </th>
          <th scope="col" className="hidden pb-2 font-medium lg:table-cell">
            Primary contact
          </th>
          <th scope="col" className="hidden pb-2 font-medium xl:table-cell">
            Time zone
          </th>
          <th scope="col" className="hidden pr-3 pb-2 text-right font-medium md:table-cell">
            Members
          </th>
          <th scope="col" className="hidden pb-2 font-medium md:table-cell">
            Created
          </th>
          <th scope="col" className="pb-2">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {clients.map((client) => {
          const status = clientStatus(client)
          const contact = client.businessEmail ?? client.businessPhone
          return (
            <tr key={client.id}>
              <td className="py-3 pr-3">
                <div className="grid min-w-0 gap-0.5">
                  <Link
                    href={routes.workspace(client.slug)}
                    title={client.name}
                    className="truncate font-medium underline-offset-4 hover:underline"
                  >
                    {client.name}
                  </Link>
                  {client.businessName && client.businessName !== client.name ? (
                    <span className="truncate text-xs text-muted-foreground">
                      {client.businessName}
                    </span>
                  ) : null}
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground sm:hidden">
                    <Badge variant={status.variant}>{status.label}</Badge>
                    <span>
                      {client.memberCount} {client.memberCount === 1 ? "member" : "members"}
                    </span>
                  </span>
                </div>
              </td>
              <td className="hidden py-3 pr-3 sm:table-cell">
                <Badge variant={status.variant}>{status.label}</Badge>
              </td>
              <td className="hidden max-w-56 py-3 pr-3 lg:table-cell">
                {contact ? (
                  <span className="block truncate">{contact}</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="hidden py-3 pr-3 text-muted-foreground xl:table-cell">
                {client.timezoneLabel}
              </td>
              <td className="hidden py-3 pr-3 text-right tabular-nums md:table-cell">
                {client.memberCount}
              </td>
              <td className="hidden py-3 pr-3 whitespace-nowrap text-muted-foreground md:table-cell">
                {client.createdLabel}
              </td>
              <td className="py-3">
                <div className="flex items-center justify-end gap-1">
                  <Link
                    href={routes.workspace(client.slug)}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                    aria-label={`Open ${client.name}`}
                  >
                    Open
                  </Link>
                  <ClientRowActions clientName={client.name} clientSlug={client.slug} />
                </div>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
