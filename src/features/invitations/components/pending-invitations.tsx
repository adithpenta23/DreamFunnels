"use client"

import { EllipsisIcon, MailXIcon, SendIcon } from "lucide-react"
import { useRef, useState, useTransition } from "react"
import { ConfirmDialog } from "@/components/feedback/confirm-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "@/components/ui/toast"
import { WORKSPACE_ROLE_LABELS } from "@/features/workspaces/lib/roles"
import { track } from "@/lib/analytics"
import { resendInvitationAction, revokeInvitationAction } from "../actions"
import { INVITATION_STATUS_LABELS, type InvitationRowStatus } from "../lib/display"
import type { InvitableRole } from "../schemas"
import type { InvitationDelivery } from "../types"

export type PendingInvitationRow = {
  id: string
  email: string
  role: InvitableRole
  status: InvitationRowStatus
  /** "Expires in 6 days" / "Expired 2 days ago", formatted on the server. */
  detail: string
  /** "Sent Sep 23, 2026", or "Created …" when no email has gone out yet. */
  sentLabel: string
}

type PendingInvitationsProps = {
  workspaceId: string
  invitations: readonly PendingInvitationRow[]
}

const STATUS_VARIANTS: Record<InvitationRowStatus, "outline" | "secondary" | "destructive"> = {
  pending: "outline",
  expired: "secondary",
  not_delivered: "destructive",
}

/** Announces a resend's outcome honestly: "sent" only when the email went out. */
export function announceResend(email: string, delivery: InvitationDelivery) {
  if (delivery === "sent") {
    toast.success("Invitation sent again", {
      description: `We emailed ${email} a new link. The previous link no longer works.`,
    })
  } else {
    toast.error("The invitation email couldn't be sent", {
      description: `The invitation for ${email} is still valid. Try resending it in a few minutes.`,
    })
  }
}

/** Open invitations with their state, and Resend / Revoke per row. */
export function PendingInvitations({ workspaceId, invitations }: PendingInvitationsProps) {
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">Pending invitations</caption>
      <thead className="border-b text-left text-xs text-muted-foreground">
        <tr>
          <th scope="col" className="pb-2 font-medium">
            Email
          </th>
          <th scope="col" className="hidden pb-2 font-medium sm:table-cell">
            Role
          </th>
          <th scope="col" className="pb-2 font-medium">
            Status
          </th>
          <th scope="col" className="w-10 pb-2">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {invitations.map((invitation) => (
          <tr key={invitation.id}>
            <td className="py-3 pr-3">
              <div className="grid min-w-0">
                <span className="font-medium break-all">{invitation.email}</span>
                <span className="text-xs text-muted-foreground">
                  <span className="sm:hidden">{WORKSPACE_ROLE_LABELS[invitation.role]} · </span>
                  {invitation.sentLabel}
                </span>
              </div>
            </td>
            <td className="hidden py-3 pr-3 sm:table-cell">
              <Badge variant="outline">{WORKSPACE_ROLE_LABELS[invitation.role]}</Badge>
            </td>
            <td className="py-3 pr-3">
              <div className="grid justify-items-start gap-0.5">
                <Badge variant={STATUS_VARIANTS[invitation.status]}>
                  {INVITATION_STATUS_LABELS[invitation.status]}
                </Badge>
                <span className="text-xs text-muted-foreground">{invitation.detail}</span>
              </div>
            </td>
            <td className="py-3 text-right">
              <InvitationRowActions workspaceId={workspaceId} invitation={invitation} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function InvitationRowActions({
  workspaceId,
  invitation,
}: {
  workspaceId: string
  invitation: PendingInvitationRow
}) {
  const trigger = useRef<HTMLButtonElement>(null)
  const [confirmRevoke, setConfirmRevoke] = useState(false)
  const [resending, startResend] = useTransition()

  const resend = () => {
    startResend(async () => {
      const result = await resendInvitationAction({ workspaceId, invitationId: invitation.id })
      if (!result.ok) {
        toast.error("Couldn't resend the invitation", { description: result.error.message })
        return
      }
      track("invitation_resent")
      announceResend(result.data.email, result.data.delivery)
    })
  }

  const revoke = async () => {
    const result = await revokeInvitationAction({ workspaceId, invitationId: invitation.id })
    if (!result.ok) return result.error.message
    track("invitation_revoked")
    toast.success("Invitation revoked", {
      description: `The link sent to ${invitation.email} no longer works.`,
    })
    return null
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          ref={trigger}
          disabled={resending}
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Actions for the invitation to ${invitation.email}`}
              aria-busy={resending}
            />
          }
        >
          <EllipsisIcon aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={resend}>
            <SendIcon aria-hidden />
            {invitation.status === "expired" ? "Send a new invitation" : "Resend invitation"}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => setConfirmRevoke(true)}>
            <MailXIcon aria-hidden />
            Revoke invitation…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmRevoke}
        onOpenChange={setConfirmRevoke}
        title={`Revoke the invitation to ${invitation.email}?`}
        description="This link will stop working. You can invite them again at any time."
        confirmLabel="Revoke invitation"
        pendingLabel="Revoking…"
        destructive
        onConfirm={revoke}
        finalFocus={trigger}
      />
    </>
  )
}
