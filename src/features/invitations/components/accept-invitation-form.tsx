"use client"

import { useRouter } from "next/navigation"
import { useActionState, useState } from "react"
import { FormError, FormField } from "@/components/forms/form-field"
import { SubmitButton } from "@/components/forms/submit-button"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/toast"
import { routes } from "@/config/routes"
import { track } from "@/lib/analytics"
import { acceptInvitationAction, type AcceptInvitationState } from "../actions"

type AcceptInvitationFormProps = {
  token: string
  workspaceName: string
  /** Accounts made from an invitation skip onboarding, so ask for a name here. */
  askForName: boolean
}

/**
 * The accept button (and, for new accounts, their name). The token is the
 * only thing submitted: the server derives the workspace and role from it and
 * checks the signed-in email against the invitation.
 */
export function AcceptInvitationForm({
  token,
  workspaceName,
  askForName,
}: AcceptInvitationFormProps) {
  const router = useRouter()
  const [fullName, setFullName] = useState("")
  const [state, formAction] = useActionState<AcceptInvitationState, FormData>(
    async (previous, formData) => {
      const result = await acceptInvitationAction(previous, formData)
      if (result?.ok) {
        track("invitation_accepted")
        toast.success(
          result.data.alreadyMember
            ? `You're already a member of ${workspaceName}`
            : `Welcome to ${workspaceName}`
        )
        router.push(routes.workspace(result.data.workspaceSlug))
      }
      return result
    },
    null
  )

  const fieldErrors = state && !state.ok ? state.error.fieldErrors : undefined
  const formError = state && !state.ok && !fieldErrors ? state.error.message : undefined
  // Once accepted, keep the button busy while the workspace loads.
  const accepted = state?.ok === true

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <input type="hidden" name="token" value={token} />
      {askForName ? (
        <FormField
          id="fullName"
          label="Your name"
          hint="How your teammates will see you."
          error={fieldErrors?.fullName}
        >
          <Input
            name="fullName"
            autoComplete="name"
            maxLength={120}
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            required
            autoFocus
          />
        </FormField>
      ) : null}
      <FormError message={formError} />
      <SubmitButton
        className="w-full"
        size="lg"
        pendingLabel="Joining…"
        disabled={accepted}
        aria-busy={accepted}
      >
        {accepted ? "Opening workspace…" : "Accept invitation"}
      </SubmitButton>
    </form>
  )
}
