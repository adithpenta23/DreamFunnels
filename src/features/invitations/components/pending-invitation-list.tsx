"use client"

import { Loader2Icon, MailOpenIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { FormField } from "@/components/forms/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/toast"
import { routes } from "@/config/routes"
import { track } from "@/lib/analytics"
import { acceptPendingInvitationAction } from "../actions"
import type { PendingInvitation } from "../types"

export type PendingInvitationRow = PendingInvitation & {
  /** Formatted on the server, so every browser renders the same text. */
  expiresLabel: string
}

type PendingInvitationListProps = {
  invitations: readonly PendingInvitationRow[]
  /** Accounts without a name give one when they join (they may skip onboarding). */
  askForName: boolean
}

/**
 * Invitations waiting for the signed-in user's verified email, shown on
 * onboarding (e.g. after confirming the email on another device, without the
 * invitation link). Each one is joined only by pressing its Accept button;
 * the server checks the email again and picks the workspace and role.
 */
export function PendingInvitationList({ invitations, askForName }: PendingInvitationListProps) {
  const router = useRouter()
  const [fullName, setFullName] = useState("")
  const [nameError, setNameError] = useState<string | undefined>()
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const [acceptingId, setAcceptingId] = useState<string | null>(null)
  const [joinedId, setJoinedId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const accept = (invitation: PendingInvitationRow) => {
    setNameError(undefined)
    setRowErrors({})
    setAcceptingId(invitation.id)
    startTransition(async () => {
      const result = await acceptPendingInvitationAction({
        invitationId: invitation.id,
        ...(askForName ? { fullName } : {}),
      })
      if (!result.ok) {
        const fieldError = result.error.fieldErrors?.fullName?.[0]
        if (fieldError) setNameError(fieldError)
        else setRowErrors({ [invitation.id]: result.error.message })
        setAcceptingId(null)
        return
      }
      track("invitation_accepted")
      setJoinedId(invitation.id)
      toast.success(
        result.data.alreadyMember
          ? `You're already a member of ${invitation.workspaceName}`
          : `Welcome to ${invitation.workspaceName}`
      )
      router.push(routes.workspace(result.data.workspaceSlug))
    })
  }

  const visible = invitations.filter((invitation) => invitation.id !== joinedId)

  return (
    <div className="grid gap-4">
      {askForName ? (
        <FormField
          id="pending-full-name"
          // Distinct from the setup form's "Your name" further down the page.
          label="Your name for the team you join"
          hint="How your teammates will see you."
          error={nameError}
        >
          <Input
            name="fullName"
            autoComplete="name"
            maxLength={120}
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            disabled={pending}
          />
        </FormField>
      ) : null}
      <ul className="grid gap-3" aria-label="Pending invitations">
        {visible.map((invitation) => {
          const accepting = acceptingId === invitation.id
          const error = rowErrors[invitation.id]
          const errorId = `pending-invitation-${invitation.id}-error`
          return (
            <li
              key={invitation.id}
              className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center"
            >
              <MailOpenIcon
                className="hidden size-5 shrink-0 text-muted-foreground sm:block"
                aria-hidden
              />
              <div className="grid min-w-0 flex-1 gap-0.5">
                <p className="font-medium break-words">{invitation.workspaceName}</p>
                <p className="text-sm text-muted-foreground">
                  {invitation.inviterName
                    ? `${invitation.inviterName} invited you`
                    : "You're invited"}{" "}
                  as {invitation.role === "admin" ? "an admin" : "a member"} · Expires{" "}
                  {invitation.expiresLabel}
                </p>
                {error ? (
                  <p id={errorId} role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                ) : null}
              </div>
              <Button
                onClick={() => accept(invitation)}
                // Stay disabled while the joined workspace opens.
                disabled={pending || joinedId !== null}
                aria-busy={accepting}
                aria-label={`Accept invitation to ${invitation.workspaceName}`}
                aria-describedby={error ? errorId : undefined}
                className="sm:shrink-0"
              >
                {accepting ? <Loader2Icon className="animate-spin" aria-hidden /> : null}
                {accepting ? "Joining…" : "Accept"}
              </Button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
