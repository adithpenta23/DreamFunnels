"use client"

import { useActionState } from "react"
import { FormError, FormField } from "@/components/forms/form-field"
import { PasswordInput } from "@/components/forms/password-input"
import { SubmitButton } from "@/components/forms/submit-button"
import { toast } from "@/components/ui/toast"
import { track } from "@/lib/analytics"
import { changePassword, type PasswordUpdateState } from "../actions"
import { PASSWORD_MIN_LENGTH } from "../schemas"

/**
 * Changes the signed-in user's password. The fields are uncontrolled on
 * purpose: React clears them after every submission, so no password lingers
 * in the page.
 */
export function ChangePasswordForm() {
  const [state, formAction] = useActionState<PasswordUpdateState, FormData>(
    async (previous, formData) => {
      const result = await changePassword(previous, formData)
      if (result?.ok) {
        track("password_changed", { via: "settings" })
        toast.success("Password updated", {
          description: "Your other devices have been signed out.",
        })
      }
      return result
    },
    null
  )

  const fieldErrors = state && !state.ok ? state.error.fieldErrors : undefined
  const formError = state && !state.ok && !fieldErrors ? state.error.message : undefined

  return (
    <form action={formAction} className="grid max-w-md gap-4" noValidate>
      <FormField id="currentPassword" label="Current password" error={fieldErrors?.currentPassword}>
        <PasswordInput name="currentPassword" autoComplete="current-password" required />
      </FormField>
      <FormField
        id="password"
        label="New password"
        hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
        error={fieldErrors?.password}
      >
        <PasswordInput name="password" autoComplete="new-password" required />
      </FormField>
      <FormField
        id="confirmPassword"
        label="Confirm new password"
        error={fieldErrors?.confirmPassword}
      >
        <PasswordInput name="confirmPassword" autoComplete="new-password" required />
      </FormField>
      <FormError message={formError} />
      <div>
        <SubmitButton pendingLabel="Updating…">Update password</SubmitButton>
      </div>
    </form>
  )
}
