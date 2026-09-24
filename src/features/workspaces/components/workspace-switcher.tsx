"use client"

import { Building2Icon, CheckIcon, ChevronsUpDownIcon, PlusIcon, SettingsIcon } from "lucide-react"
import Link from "next/link"
import { useAppContext } from "@/components/providers/app-context"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { routes } from "@/config/routes"
import { cn } from "@/lib/utils"
import { clientsHomeSlug } from "../lib/members"
import { WORKSPACE_ROLE_LABELS } from "../lib/roles"
import type { WorkspaceSummary } from "../types"

function WorkspaceMark({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground",
        className
      )}
    >
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  )
}

function WorkspaceItem({ item, current }: { item: WorkspaceSummary; current: boolean }) {
  return (
    <DropdownMenuLinkItem
      render={<Link href={routes.workspace(item.slug)} />}
      aria-current={current ? "page" : undefined}
    >
      <WorkspaceMark
        name={item.name}
        className={cn("size-6 rounded-md text-xs", item.type === "client" && "bg-muted-foreground")}
      />
      <span className="min-w-0 flex-1 truncate">{item.name}</span>
      {current ? <CheckIcon className="text-muted-foreground" aria-hidden /> : null}
    </DropdownMenuLinkItem>
  )
}

/**
 * Shows the current workspace and switches between the user's workspaces:
 * their agency-level workspaces, then client workspaces (the first few by
 * name; an agency with many clients finds the rest on its Clients page).
 * Switching is navigation: the workspace lives in the URL (/w/[slug]), so
 * every tab can hold a different one and links stay shareable.
 */
export function WorkspaceSwitcher() {
  const { workspace, workspaces, moreClients, parentWorkspace } = useAppContext()

  const agencies = workspaces.filter((item) => item.type === "agency")
  const listedClients = workspaces.filter((item) => item.type === "client")
  // The current client is always listed, even beyond the cap.
  const clients =
    workspace.type === "client" && !listedClients.some((item) => item.id === workspace.id)
      ? [workspace, ...listedClients]
      : listedClients
  const clientsHome = clientsHomeSlug(workspace, parentWorkspace, agencies)
  const subtitle =
    workspace.type === "client"
      ? parentWorkspace
        ? `Client of ${parentWorkspace.name}`
        : `Client · ${WORKSPACE_ROLE_LABELS[workspace.role]}`
      : WORKSPACE_ROLE_LABELS[workspace.role]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Current workspace: ${workspace.name}. Switch workspace`}
        className="flex w-full items-center gap-2 rounded-lg p-1.5 text-left outline-none hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-ring/50 data-popup-open:bg-sidebar-accent"
      >
        <WorkspaceMark
          name={workspace.name}
          className={cn(workspace.type === "client" && "bg-muted-foreground")}
        />
        <span className="grid min-w-0 flex-1 leading-tight">
          <span className="truncate text-sm font-medium">{workspace.name}</span>
          <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
        </span>
        <ChevronsUpDownIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-(--anchor-width) min-w-60">
        {agencies.length > 0 ? (
          <DropdownMenuGroup>
            <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
            {agencies.map((item) => (
              <WorkspaceItem key={item.id} item={item} current={item.id === workspace.id} />
            ))}
          </DropdownMenuGroup>
        ) : null}
        {clients.length > 0 ? (
          <>
            {agencies.length > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuGroup>
              <DropdownMenuLabel>Clients</DropdownMenuLabel>
              {clients.map((item) => (
                <WorkspaceItem key={item.id} item={item} current={item.id === workspace.id} />
              ))}
              {clientsHome ? (
                <DropdownMenuLinkItem render={<Link href={routes.clients(clientsHome)} />}>
                  <Building2Icon aria-hidden />
                  {moreClients ? "View all clients" : "Manage clients"}
                </DropdownMenuLinkItem>
              ) : null}
            </DropdownMenuGroup>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuLinkItem render={<Link href={routes.workspaceSettings(workspace.slug)} />}>
          <SettingsIcon aria-hidden />
          Workspace settings
        </DropdownMenuLinkItem>
        <DropdownMenuLinkItem render={<Link href={routes.newWorkspace} />}>
          <PlusIcon aria-hidden />
          Create workspace
        </DropdownMenuLinkItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
