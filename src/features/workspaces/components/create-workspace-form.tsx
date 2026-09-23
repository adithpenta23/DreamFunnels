"use client"

import { useActionState } from "react"
import { BrowserHints } from "@/components/forms/browser-hints"
import { FormError } from "@/components/forms/form-field"
import { SubmitButton } from "@/components/forms/submit-button"
import { createWorkspaceAction, type CreateWorkspaceState } from "../actions"
import { NewWorkspaceFields } from "./new-workspace-fields"

export function CreateWorkspaceForm() {
  const [state, formAction] = useActionState<CreateWorkspaceState, FormData>(
    createWorkspaceAction,
    null
  )
  const fieldErrors = state?.error.fieldErrors
  const formError = state && !fieldErrors ? state.error.message : undefined

  return (
    <form action={formAction} className="grid gap-5" noValidate>
      <BrowserHints />
      <NewWorkspaceFields errors={fieldErrors} autoFocus />
      <FormError message={formError} />
      <SubmitButton className="w-full" size="lg" pendingLabel="Creating workspace…">
        Create workspace
      </SubmitButton>
    </form>
  )
}
