"use client"

import { useRouter } from "next/navigation"
import { useActionState } from "react"
import { FormError, FormField } from "@/components/forms/form-field"
import { PasswordInput } from "@/components/forms/password-input"
import { SubmitButton } from "@/components/forms/submit-button"
import { toast } from "@/components/ui/toast"
import { routes } from "@/config/routes"
import { track } from "@/lib/analytics"
import { resetPassword, type PasswordUpdateState } from "../actions"
import { PASSWORD_MIN_LENGTH } from "../schemas"

export function ResetPasswordForm() {
  const router = useRouter()
  const [state, formAction] = useActionState<PasswordUpdateState, FormData>(
    async (previous, formData) => {
      const result = await resetPassword(previous, formData)
      if (result?.ok) {
        track("password_changed", { via: "reset_link" })
        toast.success("Password updated", {
          description: "You're signed in, and your other devices have been signed out.",
        })
        router.replace(routes.dashboard)
      }
      return result
    },
    null
  )

  const fieldErrors = state && !state.ok ? state.error.fieldErrors : undefined
  const formError = state && !state.ok && !fieldErrors ? state.error.message : undefined

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <FormField
        id="password"
        label="New password"
        hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
        error={fieldErrors?.password}
      >
        <PasswordInput name="password" autoComplete="new-password" required autoFocus />
      </FormField>
      <FormField
        id="confirmPassword"
        label="Confirm new password"
        error={fieldErrors?.confirmPassword}
      >
        <PasswordInput name="confirmPassword" autoComplete="new-password" required />
      </FormField>
      <FormError message={formError} />
      <SubmitButton className="w-full" size="lg" pendingLabel="Updating password…">
        Update password
      </SubmitButton>
    </form>
  )
}
