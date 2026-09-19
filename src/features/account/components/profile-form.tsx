"use client"

import { useActionState, useState } from "react"
import { FormError, FormField } from "@/components/forms/form-field"
import { SubmitButton } from "@/components/forms/submit-button"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/toast"
import { track } from "@/lib/analytics"
import { updateProfile, type UpdateProfileState } from "../actions"

type ProfileFormProps = {
  fullName: string | null
  email: string | null
}

export function ProfileForm({ fullName, email }: ProfileFormProps) {
  const initialName = fullName ?? ""
  const [name, setName] = useState(initialName)

  const [state, formAction] = useActionState<UpdateProfileState, FormData>(
    async (previous, formData) => {
      const result = await updateProfile(previous, formData)
      if (result?.ok) {
        track("profile_updated")
        toast.success("Profile updated")
      }
      return result
    },
    null
  )

  const fieldErrors = state && !state.ok ? state.error.fieldErrors : undefined
  const formError = state && !state.ok && !fieldErrors ? state.error.message : undefined
  // After a save the page re-renders with the new name, so this settles back to false.
  const dirty = name.trim() !== initialName

  return (
    <form action={formAction} className="grid max-w-md gap-5" noValidate>
      <FormField id="fullName" label="Full name" error={fieldErrors?.fullName}>
        <Input
          name="fullName"
          autoComplete="name"
          maxLength={120}
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </FormField>
      <FormField
        id="email"
        label="Email"
        hint="You sign in with this address. Changing it isn't available yet."
      >
        <Input type="email" value={email ?? ""} readOnly disabled />
      </FormField>
      <FormError message={formError} />
      <div>
        <SubmitButton disabled={!dirty} pendingLabel="Saving…">
          Save changes
        </SubmitButton>
      </div>
    </form>
  )
}
