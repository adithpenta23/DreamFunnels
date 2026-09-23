"use client"

import { MailCheckIcon } from "lucide-react"
import Link from "next/link"
import { useActionState, useState } from "react"
import { FormError, FormField } from "@/components/forms/form-field"
import { SubmitButton } from "@/components/forms/submit-button"
import { captchaSiteKey, TurnstileWidget } from "@/components/forms/turnstile-widget"
import { buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { routes } from "@/config/routes"
import { track } from "@/lib/analytics"
import { requestPasswordReset, type ForgotPasswordState } from "../actions"

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState<ForgotPasswordState, FormData>(
    async (previous, formData) => {
      const result = await requestPasswordReset(previous, formData)
      if (result?.ok) track("password_reset_requested")
      return result
    },
    null
  )
  const [email, setEmail] = useState("")
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const waitingForCaptcha = captchaSiteKey() !== null && !captchaToken

  if (state?.ok) {
    return (
      <div role="status" className="grid gap-4 text-center">
        <div className="mx-auto rounded-full bg-muted p-3 text-muted-foreground">
          <MailCheckIcon className="size-6" aria-hidden />
        </div>
        <div className="space-y-1">
          <h2 className="font-semibold">Check your email</h2>
          <p className="text-sm text-muted-foreground">
            If an account exists for <strong className="text-foreground">{state.data.email}</strong>
            , you&apos;ll get a link to reset your password. It expires in one hour.
          </p>
        </div>
        <Link href={routes.login} className={buttonVariants({ variant: "outline" })}>
          Back to sign in
        </Link>
      </div>
    )
  }

  const fieldErrors = state?.error.fieldErrors
  const formError = state && !fieldErrors ? state.error.message : undefined

  return (
    <form action={formAction} className="grid gap-4" noValidate>
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
      <TurnstileWidget action="password_reset" onTokenChange={setCaptchaToken} resetKey={state} />
      <FormError message={formError} />
      <SubmitButton
        className="w-full"
        size="lg"
        pendingLabel="Sending link…"
        disabled={waitingForCaptcha}
      >
        Send reset link
      </SubmitButton>
    </form>
  )
}
