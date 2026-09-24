"use client"

import { Loader2Icon } from "lucide-react"
import { useState, useTransition, type FormEvent, type RefObject } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "@/components/ui/toast"
import { changeMemberRoleAction } from "../actions"
import type { AssignableMemberRole } from "../lib/members"
import { WORKSPACE_ROLE_LABELS, type WorkspaceRole } from "../lib/roles"
import type { WorkspaceType } from "../types"
import { RoleOptions } from "./role-options"

type ChangeRoleDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  workspaceType: WorkspaceType
  member: { userId: string; role: WorkspaceRole; displayName: string }
  finalFocus?: RefObject<HTMLElement | null>
}

/**
 * Member ⇄ admin. For an owner (only owners see this for owners), picking a
 * role takes their ownership away; the database refuses it for the last owner
 * and the message says so.
 */
export function ChangeRoleDialog({
  open,
  onOpenChange,
  workspaceId,
  workspaceType,
  member,
  finalFocus,
}: ChangeRoleDialogProps) {
  const initial: AssignableMemberRole = member.role === "member" ? "member" : "admin"
  const [role, setRole] = useState<AssignableMemberRole>(initial)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const unchanged = role === member.role

  const setOpen = (next: boolean) => {
    if (pending) return
    if (next) {
      setRole(initial)
      setError(null)
    }
    onOpenChange(next)
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await changeMemberRoleAction({ workspaceId, userId: member.userId, role })
      if (!result.ok) {
        setError(result.error.fieldErrors?.role?.[0] ?? result.error.message)
        return
      }
      toast.success(`${member.displayName} is now ${role === "admin" ? "an admin" : "a member"}`)
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md" {...(finalFocus ? { finalFocus } : {})}>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>Change {member.displayName}&apos;s role</DialogTitle>
            <DialogDescription>
              Current role: {WORKSPACE_ROLE_LABELS[member.role]}.
              {member.role === "owner"
                ? " Choosing a role here removes their ownership of this workspace."
                : null}
            </DialogDescription>
          </DialogHeader>
          <RoleOptions
            name="role"
            legend="New role"
            value={role}
            onValueChange={setRole}
            workspaceType={workspaceType}
            disabled={pending}
          />
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />} disabled={pending}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={pending || unchanged} aria-busy={pending}>
              {pending ? <Loader2Icon className="animate-spin" aria-hidden /> : null}
              {pending ? "Saving…" : "Save role"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
