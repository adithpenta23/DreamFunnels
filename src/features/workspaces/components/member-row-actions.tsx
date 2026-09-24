"use client"

import { EllipsisIcon, UserCogIcon, UserMinusIcon } from "lucide-react"
import { useRef, useState } from "react"
import { ConfirmDialog } from "@/components/feedback/confirm-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "@/components/ui/toast"
import { removeMemberAction } from "../actions"
import type { MemberActions } from "../lib/members"
import type { WorkspaceRole } from "../lib/roles"
import type { WorkspaceType } from "../types"
import { ChangeRoleDialog } from "./change-role-dialog"

type MemberRowActionsProps = {
  workspaceId: string
  workspaceName: string
  workspaceType: WorkspaceType
  member: { userId: string; role: WorkspaceRole; displayName: string }
  actions: MemberActions
}

/** The "…" menu on a member row, and the dialogs it opens. */
export function MemberRowActions({
  workspaceId,
  workspaceName,
  workspaceType,
  member,
  actions,
}: MemberRowActionsProps) {
  const trigger = useRef<HTMLButtonElement>(null)
  const [dialog, setDialog] = useState<"role" | "remove" | null>(null)

  const remove = async () => {
    const result = await removeMemberAction({ workspaceId, userId: member.userId })
    if (!result.ok) return result.error.message
    toast.success(`${member.displayName} was removed`, {
      description: `They no longer have access to ${workspaceName}.`,
    })
    return null
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          ref={trigger}
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Actions for ${member.displayName}`}
            />
          }
        >
          <EllipsisIcon aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {actions.canChangeRole ? (
            <DropdownMenuItem onClick={() => setDialog("role")}>
              <UserCogIcon aria-hidden />
              Change role…
            </DropdownMenuItem>
          ) : null}
          {actions.canRemove ? (
            <DropdownMenuItem variant="destructive" onClick={() => setDialog("remove")}>
              <UserMinusIcon aria-hidden />
              Remove from workspace…
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {actions.canChangeRole ? (
        <ChangeRoleDialog
          open={dialog === "role"}
          onOpenChange={(open) => setDialog(open ? "role" : null)}
          workspaceId={workspaceId}
          workspaceType={workspaceType}
          member={member}
          finalFocus={trigger}
        />
      ) : null}
      {actions.canRemove ? (
        <ConfirmDialog
          open={dialog === "remove"}
          onOpenChange={(open) => setDialog(open ? "remove" : null)}
          title={`Remove ${member.displayName} from ${workspaceName}?`}
          description="This removes their access to this workspace. Their account and any other workspaces they belong to aren't affected. You can invite them again later."
          confirmLabel="Remove member"
          pendingLabel="Removing…"
          destructive
          onConfirm={remove}
          finalFocus={trigger}
        />
      ) : null}
    </>
  )
}
