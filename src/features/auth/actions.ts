"use server"

import type { Route } from "next"
import { redirect } from "next/navigation"
import { routes } from "@/config/routes"
import { ok, validationFailed, type ActionFailure, type ActionResult } from "@/lib/action-result"
import { CAPTCHA_FIELD } from "@/lib/captcha/shared"
import { publicEnv } from "@/lib/env/public"
import { isHostedEnv } from "@/lib/env/schema"
import { serverEnv } from "@/lib/env/server"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { runAction } from "@/lib/run-action"
import { createClient } from "@/lib/supabase/server"
import { toAuthAppError } from "./lib/auth-errors"
import { buildAuthCallbackUrl } from "./lib/callback-url"
import { getSafeRedirectPath } from "./lib/redirect"
import {
  changePasswordSchema,
  emailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "./schemas"
import { limitAuthByEmail, limitAuthByIp, requireHuman } from "./server/abuse-protection"
import { signOutOtherSessions, verifyCurrentPassword } from "./server/password"
import { isRecoverySession, requireUser } from "./server/session"

/**
 * Authentication mutations. Each one validates with Zod, talks to Supabase
 * Auth with the request-scoped client (so session cookies are written on the
 * response), and returns an ActionResult — or redirects on success.
 *
 * The public, pre-sign-in actions are rate-limited per IP and per email, and
 * sign-up and password reset also require a CAPTCHA (server/abuse-protection.ts)
 * before Supabase is called.
 *
 * Logs carry event names and error codes only: never emails or passwords.
 */

const field = (formData: FormData, name: string) => formData.get(name) ?? undefined

// --- Sign in -----------------------------------------------------------------

/** Success redirects, so the form only ever sees failures. */
export type SignInState = ActionFailure | null

export async function signIn(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = signInSchema.safeParse({
    email: field(formData, "email"),
    password: field(formData, "password"),
    next: field(formData, "next"),
  })
  if (!parsed.success) return validationFailed(parsed.error)
  const { email, password, next } = parsed.data

  const result = await runAction("auth.signIn", async () => {
    await limitAuthByIp("signIn")
    await limitAuthByEmail("signIn", email)
    const supabase = await createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw toAuthAppError(error, "sign_in")
    logger.info("auth.signed_in")
  })
  if (!result.ok) return result

  // /dashboard (the default) routes to onboarding or the last-used workspace.
  // getSafeRedirectPath only returns same-origin paths, so the cast is sound.
  redirect(getSafeRedirectPath(next) as Route)
}

// --- Sign up -----------------------------------------------------------------

/** `ok` means "check your email": the project requires email confirmation. */
export type SignUpState = ActionResult<{ email: string }> | null

export async function signUp(_previous: SignUpState, formData: FormData): Promise<SignUpState> {
  const parsed = signUpSchema.safeParse({
    email: field(formData, "email"),
    password: field(formData, "password"),
  })
  if (!parsed.success) return validationFailed(parsed.error)
  const { email, password } = parsed.data

  const result = await runAction("auth.signUp", async () => {
    await limitAuthByIp("signUp")
    await requireHuman(formData.get(CAPTCHA_FIELD), "signup")
    await limitAuthByEmail("signUp", email)
    const supabase = await createClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: buildAuthCallbackUrl(publicEnv.NEXT_PUBLIC_APP_URL, routes.dashboard),
      },
    })
    if (error) throw toAuthAppError(error, "sign_up")

    // With email confirmation on, there is no session yet. (For an address
    // that already has an account, Supabase deliberately answers the same
    // way, so sign-up can't be used to discover who has an account.)
    const needsConfirmation = data.session === null
    logger.info("auth.signed_up", { needsConfirmation })
    if (!needsConfirmation && isHostedEnv(serverEnv.APP_ENV)) {
      // Hosted projects must require email confirmation (docs/ARCHITECTURE.md
      // "Deployment"). A session straight after sign-up means it's off.
      logger.error("security.email_confirmation_disabled", { appEnv: serverEnv.APP_ENV })
    }
    return { needsConfirmation }
  })
  if (!result.ok) return result

  if (!result.data.needsConfirmation) redirect(routes.onboarding)
  return ok({ email })
}

/** Re-sends the signup confirmation email from the "check your email" screen. */
export async function resendConfirmation(email: string): Promise<ActionResult<null>> {
  const parsed = emailSchema.safeParse(email)
  if (!parsed.success) return validationFailed(parsed.error)

  return runAction("auth.resendConfirmation", async () => {
    await limitAuthByIp("signUp")
    await limitAuthByEmail("signUp", parsed.data)
    const supabase = await createClient()
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: parsed.data,
      options: {
        emailRedirectTo: buildAuthCallbackUrl(publicEnv.NEXT_PUBLIC_APP_URL, routes.dashboard),
      },
    })
    if (error) throw toAuthAppError(error, "resend_confirmation")
    return null
  })
}

// --- Sign out ----------------------------------------------------------------

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  // "local" ends this browser's session only; other devices stay signed in.
  const { error } = await supabase.auth.signOut({ scope: "local" })
  if (error) logger.warn("auth.sign_out_failed", { code: error.code, status: error.status })
  redirect(routes.login)
}

// --- Forgot / reset password -------------------------------------------------

/**
 * `ok` is returned whether or not an account exists for the address: Supabase
 * only emails existing accounts, and the UI says "if an account exists".
 */
export type ForgotPasswordState = ActionResult<{ email: string }> | null

export async function requestPasswordReset(
  _previous: ForgotPasswordState,
  formData: FormData
): Promise<ForgotPasswordState> {
  const parsed = forgotPasswordSchema.safeParse({ email: field(formData, "email") })
  if (!parsed.success) return validationFailed(parsed.error)
  const { email } = parsed.data

  return runAction("auth.requestPasswordReset", async () => {
    await limitAuthByIp("passwordReset")
    await requireHuman(formData.get(CAPTCHA_FIELD), "password_reset")
    await limitAuthByEmail("passwordReset", email)
    const supabase = await createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: buildAuthCallbackUrl(publicEnv.NEXT_PUBLIC_APP_URL, routes.resetPassword),
    })
    if (error) throw toAuthAppError(error, "request_password_reset")
    logger.info("auth.password_reset_requested")
    return { email }
  })
}

export type PasswordUpdateState = ActionResult<null> | null

/** Sets a new password from a reset link. Only valid in a recent recovery session. */
export async function resetPassword(
  _previous: PasswordUpdateState,
  formData: FormData
): Promise<PasswordUpdateState> {
  const parsed = resetPasswordSchema.safeParse({
    password: field(formData, "password"),
    confirmPassword: field(formData, "confirmPassword"),
  })
  if (!parsed.success) return validationFailed(parsed.error)

  return runAction("auth.resetPassword", async () => {
    await requireUser()
    if (!(await isRecoverySession())) {
      throw new AppError(
        "FORBIDDEN",
        "This password reset link has expired. Request a new one to continue.",
        { expose: true }
      )
    }

    const supabase = await createClient()
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
    if (error) throw toAuthAppError(error, "update_password")
    await signOutOtherSessions(supabase)

    logger.info("auth.password_reset_completed")
    return null
  })
}

/** Changes the password of a signed-in user, who must confirm the current one. */
export async function changePassword(
  _previous: PasswordUpdateState,
  formData: FormData
): Promise<PasswordUpdateState> {
  const parsed = changePasswordSchema.safeParse({
    currentPassword: field(formData, "currentPassword"),
    password: field(formData, "password"),
    confirmPassword: field(formData, "confirmPassword"),
  })
  if (!parsed.success) return validationFailed(parsed.error)
  const { currentPassword, password } = parsed.data

  return runAction("auth.changePassword", async () => {
    const user = await requireUser()
    if (!user.email) {
      throw new AppError("INTERNAL", "Signed-in user has no email address")
    }
    await verifyCurrentPassword(user.email, currentPassword)

    const supabase = await createClient()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw toAuthAppError(error, "update_password")
    await signOutOtherSessions(supabase)

    logger.info("auth.password_changed")
    return null
  })
}
