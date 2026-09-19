"use client"

import Link from "next/link"
import { useActionState, useState } from "react"
import { FormError, FormField } from "@/components/forms/form-field"
import { PasswordInput } from "@/components/forms/password-input"
import { SubmitButton } from "@/components/forms/submit-button"
import { Input } from "@/components/ui/input"
import { routes } from "@/config/routes"
import { signIn, type SignInState } from "../actions"

type LoginFormProps = {
  /** Where to go after signing in (sanitised again on the server). */
  next?: string | undefined
}

export function LoginForm({ next }: LoginFormProps) {
  const [state, formAction] = useActionState<SignInState, FormData>(signIn, null)
  // Controlled so a failed attempt keeps the email (React resets uncontrolled fields).
  const [email, setEmail] = useState("")

  const fieldErrors = state?.error.fieldErrors
  const formError = state && !fieldErrors ? state.error.message : undefined

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <input type="hidden" name="next" value={next ?? ""} />
      <FormField id="email" label="Email" error={fieldErrors?.email}>
        <Input
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoFocus
        />
      </FormField>
      <FormField
        id="password"
        label="Password"
        error={fieldErrors?.password}
        labelAction={
          <Link
            href={routes.forgotPassword}
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Forgot password?
          </Link>
        }
      >
        <PasswordInput name="password" autoComplete="current-password" required />
      </FormField>
      <FormError message={formError} />
      <SubmitButton className="w-full" size="lg" pendingLabel="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  )
}
