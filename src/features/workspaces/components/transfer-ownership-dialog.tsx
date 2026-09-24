"use client"

import { Loader2Icon } from "lucide-react"
import { useState, useTransition, type FormEvent, type RefObject } from "react"
import { FormError, FormField } from "@/components/forms/form-field"
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
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/toast"
import { transferOwnershipAction } from "../actions"

type TransferOwnershipDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  workspaceName: string
  member: { userId: string; displayName: string }
  finalFocus?: RefObject<HTMLElement | null>
}

/**
 * Hands the caller's ownership to a member: they become the owner, the caller
 * an admin. Typing the workspace name confirms it (checked on the server too);
 * the button stays disabled until it matches.
 */
export function TransferOwnershipDialog({
  open,
  onOpenChange,
  workspaceId,
  workspaceName,
  member,
  finalFocus,
}: TransferOwnershipDialogProps) {
  const expected = workspaceName.trim()
  const [confirmation, setConfirmation] = useState("")
  const [fieldError, setFieldError] = useState<string | undefined>()
  const [formError, setFormError] = useState<string | undefined>()
  const [pending, startTransition] = useTransition()
  const matches = confirmation.trim() === expected

  const setOpen = (next: boolean) => {
    if (pending) return
    if (next) {
      setConfirmation("")
      setFieldError(undefined)
      setFormError(undefined)
    }
    onOpenChange(next)
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!matches) {
      setFieldError(`Type ${expected} exactly to confirm.`)
      return
    }
    setFieldError(undefined)
    setFormError(undefined)
    startTransition(async () => {
      const result = await transferOwnershipAction({
        workspaceId,
        userId: member.userId,
        confirmation,
      })
      if (!result.ok) {
        const confirmationError = result.error.fieldErrors?.confirmation?.[0]
        if (confirmationError) setFieldError(confirmationError)
        else setFormError(result.error.message)
        return
      }
      toast.success(`${result.data.newOwnerName} is now the owner of ${expected}`, {
        description: "You're an admin of this workspace now.",
      })
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md" {...(finalFocus ? { finalFocus } : {})}>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>Transfer ownership to {member.displayName}?</DialogTitle>
            <DialogDescription>
              {member.displayName} will become the workspace owner and you will become an admin.
              Only an owner can make you an owner again.
            </DialogDescription>
          </DialogHeader>
          <FormField
            id="transfer-confirmation"
            label={
              <span>
                Type <strong className="font-semibold break-all">{expected}</strong> to confirm
              </span>
            }
            error={fieldError}
          >
            <Input
              name="confirmation"
              autoComplete="off"
              spellCheck={false}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              disabled={pending}
            />
          </FormField>
          <FormError message={formError} />
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />} disabled={pending}>
              Cancel
            </DialogClose>
            <Button
              type="submit"
              variant="destructive"
              disabled={pending || !matches}
              aria-busy={pending}
            >
              {pending ? <Loader2Icon className="animate-spin" aria-hidden /> : null}
              {pending ? "Transferring…" : "Transfer ownership"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
