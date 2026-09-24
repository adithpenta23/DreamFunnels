"use client"

import { MailPlusIcon } from "lucide-react"
import { useActionState, useState, useTransition } from "react"
import { FormError, FormField } from "@/components/forms/form-field"
import { SubmitButton } from "@/components/forms/submit-button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { RoleOptions } from "@/features/workspaces/components/role-options"
import type { AssignableMemberRole } from "@/features/workspaces/lib/members"
import type { WorkspaceType } from "@/features/workspaces/types"
import { track } from "@/lib/analytics"
import {
  inviteMemberAction,
  resendInvitationAction,
  revokeInvitationAction,
  type InviteMemberState,
} from "../actions"
import { INVITATION_LIFETIME_DAYS } from "../lib/tokens"
import { announceResend } from "./pending-invitations"

type InviteMemberDialogProps = {
  workspaceId: string
  workspaceName: string
  workspaceType: WorkspaceType
}

const MESSAGE_LIMIT = 500

/**
 * "Invite member": email, role and an optional note. Every state is shown:
 * validation on the fields, pending on the button, and afterwards a toast
 * that only says "sent" when the email actually went out. An address with a
 * pending invitation gets the choice to resend or cancel it instead.
 */
export function InviteMemberDialog({
  workspaceId,
  workspaceName,
  workspaceType,
}: InviteMemberDialogProps) {
  const [open, setOpen] = useState(false)
  // A new form (and fresh action state) every time the dialog opens.
  const [session, setSession] = useState(0)

  const changeOpen = (next: boolean) => {
    if (next) setSession((value) => value + 1)
    setOpen(next)
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger render={<Button />}>
        <MailPlusIcon aria-hidden />
        Invite member
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <InviteForm
          key={session}
          workspaceId={workspaceId}
          workspaceName={workspaceName}
          workspaceType={workspaceType}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

function InviteForm({
  workspaceId,
  workspaceName,
  workspaceType,
  onDone,
}: InviteMemberDialogProps & { onDone: () => void }) {
  // Controlled so a failed attempt keeps what was typed.
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<AssignableMemberRole>("member")
  const [message, setMessage] = useState("")

  const [state, formAction] = useActionState<InviteMemberState, FormData>(
    async (previous, formData) => {
      const result = await inviteMemberAction(previous, formData)
      if (result?.ok && result.data.status === "invited") {
        track("member_invited", { role })
        if (result.data.delivery === "sent") {
          toast.success("Invitation sent", {
            description: `We emailed ${result.data.email} a link to join ${workspaceName}.`,
          })
        } else {
          toast.error("Invitation created, but the email wasn't sent", {
            description: "It's in the pending list below. Try resending it in a few minutes.",
          })
        }
        onDone()
      }
      return result
    },
    null
  )

  const fieldErrors = state && !state.ok ? state.error.fieldErrors : undefined
  const formError = state && !state.ok && !fieldErrors ? state.error.message : undefined
  const pendingInvitation = state?.ok && state.data.status === "already_pending" ? state.data : null

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>Invite someone to {workspaceName}</DialogTitle>
        <DialogDescription>
          We&apos;ll email them a link to join. It works for {INVITATION_LIFETIME_DAYS} days, and
          only for the address you enter.
        </DialogDescription>
      </DialogHeader>

      <input type="hidden" name="workspaceId" value={workspaceId} />
      <FormField id="invite-email" label="Email" error={fieldErrors?.email}>
        <Input
          name="email"
          type="email"
          autoComplete="off"
          placeholder="name@company.com"
          maxLength={254}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoFocus
        />
      </FormField>

      {pendingInvitation ? (
        <PendingInvitationChoice
          workspaceId={workspaceId}
          invitationId={pendingInvitation.invitationId}
          email={pendingInvitation.email}
          onDone={onDone}
        />
      ) : null}

      <RoleOptions
        name="role"
        value={role}
        onValueChange={setRole}
        workspaceType={workspaceType}
        error={fieldErrors?.role}
      />

      <FormField
        id="invite-message"
        label={
          <>
            Personal message <span className="font-normal text-muted-foreground">(optional)</span>
          </>
        }
        hint={`${message.length}/${MESSAGE_LIMIT} characters. Shown in the email.`}
        error={fieldErrors?.message}
      >
        <Textarea
          name="message"
          rows={3}
          maxLength={MESSAGE_LIMIT}
          placeholder="Looking forward to working with you!"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
      </FormField>

      <FormError message={formError} />
      <DialogFooter>
        <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
        <SubmitButton pendingLabel="Sending invitation…">Send invitation</SubmitButton>
      </DialogFooter>
    </form>
  )
}

/** "Already invited": resend (new link) or cancel the existing invitation. */
function PendingInvitationChoice({
  workspaceId,
  invitationId,
  email,
  onDone,
}: {
  workspaceId: string
  invitationId: string
  email: string
  onDone: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const run = (kind: "resend" | "revoke") => {
    setError(null)
    startTransition(async () => {
      if (kind === "resend") {
        const result = await resendInvitationAction({ workspaceId, invitationId })
        if (!result.ok) return setError(result.error.message)
        track("invitation_resent")
        announceResend(result.data.email, result.data.delivery)
      } else {
        const result = await revokeInvitationAction({ workspaceId, invitationId })
        if (!result.ok) return setError(result.error.message)
        track("invitation_revoked")
        toast.success("Invitation cancelled", {
          description: `The link sent to ${email} no longer works.`,
        })
      }
      onDone()
    })
  }

  return (
    <Alert>
      <AlertTitle>This person already has a pending invitation.</AlertTitle>
      <AlertDescription>
        <p>Send {email} a new link, or cancel the invitation.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => run("resend")} disabled={pending}>
            Resend invitation
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => run("revoke")}
            disabled={pending}
          >
            Cancel invitation
          </Button>
        </div>
        {error ? (
          <p role="alert" className="mt-2 text-destructive">
            {error}
          </p>
        ) : null}
      </AlertDescription>
    </Alert>
  )
}
