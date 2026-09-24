"use client"

import { Loader2Icon } from "lucide-react"
import { useState, useTransition, type ReactNode, type RefObject } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

type ConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: ReactNode
  confirmLabel: string
  pendingLabel: string
  /** Styles the confirm button as destructive (removing, revoking). */
  destructive?: boolean
  /**
   * Performs the action. Resolve to null on success (the dialog closes) or to
   * a message to show in the dialog, which stays open so the user can retry
   * or cancel.
   */
  onConfirm: () => Promise<string | null>
  /** Where focus goes when the dialog closes (e.g. the menu that opened it). */
  finalFocus?: RefObject<HTMLElement | null>
}

/**
 * Click → confirm → pending → done, for actions that can't be undone. Keyboard
 * and screen-reader friendly (Base UI AlertDialog: focus trapped, Escape
 * cancels, title and description announced). It can't be dismissed mid-action.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pendingLabel,
  destructive = false,
  onConfirm,
  finalFocus,
}: ConfirmDialogProps) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const setOpen = (next: boolean) => {
    if (pending) return
    if (!next) setError(null)
    onOpenChange(next)
  }

  const confirm = () => {
    setError(null)
    startTransition(async () => {
      const message = await onConfirm()
      if (message) setError(message)
      else onOpenChange(false)
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent {...(finalFocus ? { finalFocus } : {})}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            onClick={confirm}
            disabled={pending}
            aria-busy={pending}
          >
            {pending ? <Loader2Icon className="animate-spin" aria-hidden /> : null}
            {pending ? pendingLabel : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
