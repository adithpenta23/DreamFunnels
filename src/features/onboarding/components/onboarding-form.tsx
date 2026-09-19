"use client"

import { useActionState, useState } from "react"
import { FormError, FormField } from "@/components/forms/form-field"
import { SubmitButton } from "@/components/forms/submit-button"
import { Input } from "@/components/ui/input"
import { NewWorkspaceFields } from "@/features/workspaces/components/new-workspace-fields"
import { completeOnboarding, type OnboardingState } from "../actions"

export function OnboardingForm({ defaultFullName }: { defaultFullName: string }) {
  const [state, formAction] = useActionState<OnboardingState, FormData>(completeOnboarding, null)
  const [fullName, setFullName] = useState(defaultFullName)

  const fieldErrors = state?.error.fieldErrors
  const formError = state && !fieldErrors ? state.error.message : undefined

  return (
    <form action={formAction} className="grid gap-5" noValidate>
      <FormField id="fullName" label="Your name" error={fieldErrors?.fullName}>
        <Input
          name="fullName"
          autoComplete="name"
          placeholder="Ada Lovelace"
          maxLength={120}
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          required
          autoFocus
        />
      </FormField>
      <NewWorkspaceFields errors={fieldErrors} />
      <FormError message={formError} />
      <SubmitButton className="w-full" size="lg" pendingLabel="Creating your workspace…">
        Create workspace
      </SubmitButton>
    </form>
  )
}
