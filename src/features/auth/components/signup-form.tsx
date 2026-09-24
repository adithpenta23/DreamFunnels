"use client"

import { MailCheckIcon } from "lucide-react"
import Link from "next/link"
import { useActionState, useState, useTransition } from "react"
import { FormError, FormField } from "@/components/forms/form-field"
import { PasswordInput } from "@/components/forms/password-input"
import { SubmitButton } from "@/components/forms/submit-button"
import { captchaSiteKey, TurnstileWidget } from "@/components/forms/turnstile-widget"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/toast"
import { routes } from "@/config/routes"
import { track } from "@/lib/analytics"
import { resendConfirmation, signUp, type SignUpState } from "../actions"
import { PASSWORD_MIN_LENGTH } from "../schemas"

type SignupFormProps = {
  /**
   * Signing up from an invitation: the email is fixed to the invited address
   * (the server checks it again) and the token rides along as an opaque
   * reference, so the new account lands back on the invitation.
   */
  invitation?: { token: string; email: string } | undefined
}

export function SignupForm({ invitation }: SignupFormProps = {}) {
  const [state, formAction] = useActionState<SignUpState, FormData>(async (previous, formData) => {
    const result = await signUp(previous, formData)
    if (result?.ok) track("signup_confirmation_sent")
    return result
  }, null)
  const [email, setEmail] = useState(invitation?.email ?? "")
  // Hosted environments require the CAPTCHA; hold the button until it's solved.
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const waitingForCaptcha = captchaSiteKey() !== null && !captchaToken

  if (state?.ok) return <CheckYourEmail email={state.data.email} invited={Boolean(invitation)} />

  const fieldErrors = state?.error.fieldErrors
  const formError = state && !fieldErrors ? state.error.message : undefined

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      {invitation ? <input type="hidden" name="invite" value={invitation.token} /> : null}
      <FormField
        id="email"
        label="Work email"
        hint={invitation ? "Your invitation is for this address." : undefined}
        error={fieldErrors?.email}
      >
        <Input
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          readOnly={Boolean(invitation)}
          required
          autoFocus={!invitation}
        />
      </FormField>
      <FormField
        id="password"
        label="Password"
        hint={`At least ${PASSWORD_MIN_LENGTH} characters. A short phrase is easier to remember.`}
        error={fieldErrors?.password}
      >
        <PasswordInput name="password" autoComplete="new-password" required />
      </FormField>
      <TurnstileWidget action="signup" onTokenChange={setCaptchaToken} resetKey={state} />
      <FormError message={formError} />
      <SubmitButton
        className="w-full"
        size="lg"
        pendingLabel="Creating your account…"
        disabled={waitingForCaptcha}
      >
        Create account
      </SubmitButton>
    </form>
  )
}

function CheckYourEmail({ email, invited }: { email: string; invited: boolean }) {
  const [isResending, startTransition] = useTransition()

  const resend = () => {
    startTransition(async () => {
      const result = await resendConfirmation(email)
      if (result.ok) toast.success("Confirmation email sent", { description: `Sent to ${email}.` })
      else toast.error("Couldn't resend the email", { description: result.error.message })
    })
  }

  return (
    <div role="status" className="grid gap-4 text-center">
      <div className="mx-auto rounded-full bg-muted p-3 text-muted-foreground">
        <MailCheckIcon className="size-6" aria-hidden />
      </div>
      <div className="space-y-1">
        <h2 className="font-semibold">Check your email</h2>
        <p className="text-sm text-muted-foreground">
          We sent a confirmation link to <strong className="text-foreground">{email}</strong>.
          Follow it to finish setting up your account.
        </p>
        {invited ? (
          <p className="text-sm text-muted-foreground">
            Then you&apos;ll return to your invitation. If you confirm on another device, open the
            invitation link again after confirming.
          </p>
        ) : null}
      </div>
      <div className="grid gap-2">
        <Button variant="outline" onClick={resend} disabled={isResending}>
          {isResending ? "Sending…" : "Resend email"}
        </Button>
        <Link href={routes.login} className={buttonVariants({ variant: "ghost" })}>
          Back to sign in
        </Link>
      </div>
    </div>
  )
}
