"use client"

import { CheckIcon, ChevronsUpDownIcon, PlusIcon, SettingsIcon } from "lucide-react"
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
import { WORKSPACE_ROLE_LABELS } from "../lib/roles"

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

/**
 * Shows the current workspace and switches between the user's workspaces.
 * Switching is navigation: the workspace lives in the URL (/w/[slug]), so
 * every tab can hold a different one and links stay shareable.
 */
export function WorkspaceSwitcher() {
  const { workspace, workspaces } = useAppContext()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Current workspace: ${workspace.name}. Switch workspace`}
        className="flex w-full items-center gap-2 rounded-lg p-1.5 text-left outline-none hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-ring/50 data-popup-open:bg-sidebar-accent"
      >
        <WorkspaceMark name={workspace.name} />
        <span className="grid min-w-0 flex-1 leading-tight">
          <span className="truncate text-sm font-medium">{workspace.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {WORKSPACE_ROLE_LABELS[workspace.role]}
          </span>
        </span>
        <ChevronsUpDownIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-(--anchor-width) min-w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
          {workspaces.map((item) => {
            const current = item.id === workspace.id
            return (
              <DropdownMenuLinkItem
                key={item.id}
                render={<Link href={routes.workspace(item.slug)} />}
                aria-current={current ? "page" : undefined}
              >
                <WorkspaceMark name={item.name} className="size-6 rounded-md text-xs" />
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                {current ? <CheckIcon className="text-muted-foreground" aria-hidden /> : null}
              </DropdownMenuLinkItem>
            )
          })}
        </DropdownMenuGroup>
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
