"use client"

import { EllipsisIcon, SettingsIcon, UsersIcon } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLinkItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { routes } from "@/config/routes"

/** Quick links into a client's settings and members. */
export function ClientRowActions({
  clientName,
  clientSlug,
}: {
  clientName: string
  clientSlug: string
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${clientName}`} />
        }
      >
        <EllipsisIcon aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLinkItem render={<Link href={routes.workspaceSettings(clientSlug)} />}>
          <SettingsIcon aria-hidden />
          Settings
        </DropdownMenuLinkItem>
        <DropdownMenuLinkItem render={<Link href={routes.workspaceMembers(clientSlug)} />}>
          <UsersIcon aria-hidden />
          Members
        </DropdownMenuLinkItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
