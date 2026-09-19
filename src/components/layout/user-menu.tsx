"use client"

import { Building2Icon, LogOutIcon, UserRoundIcon } from "lucide-react"
import Link from "next/link"
import { useTransition } from "react"
import { initialsOf, useCurrentUser, useCurrentWorkspace } from "@/components/providers/app-context"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { routes } from "@/config/routes"
import { signOut } from "@/features/auth/actions"
import { resetAnalytics } from "@/lib/analytics"

export function UserMenu() {
  const user = useCurrentUser()
  const workspace = useCurrentWorkspace()
  const [isSigningOut, startTransition] = useTransition()

  const handleSignOut = () => {
    startTransition(async () => {
      resetAnalytics()
      await signOut()
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account menu" />
        }
      >
        <Avatar size="sm">
          <AvatarFallback>{initialsOf(user.fullName, user.email)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <span className="block truncate text-sm font-medium text-foreground">
              {user.fullName ?? "Your account"}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {user.email ?? "No email on file"}
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLinkItem render={<Link href={routes.accountSettings(workspace.slug)} />}>
          <UserRoundIcon aria-hidden />
          Account settings
        </DropdownMenuLinkItem>
        <DropdownMenuLinkItem render={<Link href={routes.workspaceSettings(workspace.slug)} />}>
          <Building2Icon aria-hidden />
          Workspace settings
        </DropdownMenuLinkItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut} disabled={isSigningOut}>
          <LogOutIcon aria-hidden />
          {isSigningOut ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
