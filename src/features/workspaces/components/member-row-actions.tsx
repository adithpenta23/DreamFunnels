"use client"

import {
  CrownIcon,
  EllipsisIcon,
  UserCogIcon,
  UserMinusIcon,
  UserRoundCheckIcon,
} from "lucide-react"
import { useRef, useState } from "react"
import { ConfirmDialog } from "@/components/feedback/confirm-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "@/components/ui/toast"
import { makeOwnerAction, removeMemberAction } from "../actions"
import type { MemberActions, OwnershipActions } from "../lib/members"
import type { WorkspaceRole } from "../lib/roles"
import type { WorkspaceType } from "../types"
import { ChangeRoleDialog } from "./change-role-dialog"
import { TransferOwnershipDialog } from "./transfer-ownership-dialog"

type MemberRowActionsProps = {
  workspaceId: string
  workspaceName: string
  workspaceType: WorkspaceType
  member: { userId: string; role: WorkspaceRole; displayName: string }
  actions: MemberActions
  ownership: OwnershipActions
}

type OpenDialog = "role" | "remove" | "transfer" | "make-owner" | null

/** The "…" menu on a member row, and the dialogs it opens. */
export function MemberRowActions({
  workspaceId,
  workspaceName,
  workspaceType,
  member,
  actions,
  ownership,
}: MemberRowActionsProps) {
  const trigger = useRef<HTMLButtonElement>(null)
  const [dialog, setDialog] = useState<OpenDialog>(null)
  const toggle = (name: Exclude<OpenDialog, null>) => (open: boolean) =>
    setDialog(open ? name : null)

  const remove = async () => {
    const result = await removeMemberAction({ workspaceId, userId: member.userId })
    if (!result.ok) return result.error.message
    toast.success(`${member.displayName} was removed`, {
      description: `They no longer have access to ${workspaceName}.`,
    })
    return null
  }

  const makeOwner = async () => {
    const result = await makeOwnerAction({ workspaceId, userId: member.userId })
    if (!result.ok) return result.error.message
    toast.success(`${member.displayName} is now an owner of ${workspaceName}`)
    return null
  }

  const hasItemsAboveRemove =
    actions.canChangeRole || ownership.canTransferOwnership || ownership.canMakeOwner

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
        <DropdownMenuContent align="end" className="w-56">
          {actions.canChangeRole ? (
            <DropdownMenuItem onClick={() => setDialog("role")}>
              <UserCogIcon aria-hidden />
              Change role…
            </DropdownMenuItem>
          ) : null}
          {ownership.canMakeOwner ? (
            <DropdownMenuItem onClick={() => setDialog("make-owner")}>
              <UserRoundCheckIcon aria-hidden />
              Make owner…
            </DropdownMenuItem>
          ) : null}
          {ownership.canTransferOwnership ? (
            <DropdownMenuItem onClick={() => setDialog("transfer")}>
              <CrownIcon aria-hidden />
              Transfer ownership…
            </DropdownMenuItem>
          ) : null}
          {actions.canRemove ? (
            <>
              {hasItemsAboveRemove ? <DropdownMenuSeparator /> : null}
              <DropdownMenuItem variant="destructive" onClick={() => setDialog("remove")}>
                <UserMinusIcon aria-hidden />
                Remove from workspace…
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {actions.canChangeRole ? (
        <ChangeRoleDialog
          open={dialog === "role"}
          onOpenChange={toggle("role")}
          workspaceId={workspaceId}
          workspaceType={workspaceType}
          member={member}
          finalFocus={trigger}
        />
      ) : null}
      {ownership.canTransferOwnership ? (
        <TransferOwnershipDialog
          open={dialog === "transfer"}
          onOpenChange={toggle("transfer")}
          workspaceId={workspaceId}
          workspaceName={workspaceName}
          member={member}
          finalFocus={trigger}
        />
      ) : null}
      {ownership.canMakeOwner ? (
        <ConfirmDialog
          open={dialog === "make-owner"}
          onOpenChange={toggle("make-owner")}
          title={`Make ${member.displayName} an owner of ${workspaceName}?`}
          description={`${member.displayName} will be able to manage everything in this client workspace, including its members and who owns it. Your own role doesn't change.`}
          confirmLabel="Make owner"
          pendingLabel="Saving…"
          onConfirm={makeOwner}
          finalFocus={trigger}
        />
      ) : null}
      {actions.canRemove ? (
        <ConfirmDialog
          open={dialog === "remove"}
          onOpenChange={toggle("remove")}
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
