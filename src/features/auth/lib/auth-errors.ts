import { AppError } from "@/lib/errors"

/**
 * Translates Supabase Auth failures into AppErrors with user-facing messages.
 * Pure (no SDK import) so it can be unit-tested and reused by every action.
 */

/** The parts of Supabase's `AuthError` this module relies on. */
export type AuthErrorLike = {
  code?: string | undefined
  status?: number | undefined
  message: string
}

export type AuthOperation =
  "sign_in" | "sign_up" | "request_password_reset" | "update_password" | "resend_confirmation"

const RATE_LIMIT_CODES = new Set([
  "over_request_rate_limit",
  "over_email_send_rate_limit",
  "over_sms_send_rate_limit",
])

export function isRateLimited(error: AuthErrorLike): boolean {
  return error.status === 429 || (error.code !== undefined && RATE_LIMIT_CODES.has(error.code))
}

export function toAuthAppError(error: AuthErrorLike, operation: AuthOperation): AppError {
  // Codes and statuses only: provider messages can echo user input.
  const context = { operation, status: error.status, code: error.code }
  const expected = (
    code: ConstructorParameters<typeof AppError>[0],
    message: string,
    fieldErrors?: Record<string, string[]>
  ) => new AppError(code, message, { expose: true, cause: error, context, fieldErrors })

  if (isRateLimited(error)) {
    return expected(
      "RATE_LIMITED",
      error.code === "over_email_send_rate_limit"
        ? "We've sent too many emails to this address. Please wait a few minutes and try again."
        : "Too many attempts. Please wait a minute and try again."
    )
  }

  switch (error.code) {
    case "invalid_credentials":
      return expected("UNAUTHENTICATED", "Incorrect email or password.")
    case "email_not_confirmed":
      return expected(
        "FORBIDDEN",
        "Please confirm your email address first. Check your inbox for the confirmation link."
      )
    case "user_already_exists":
    case "email_exists":
      return expected("CONFLICT", "An account with this email already exists.", {
        email: ["An account with this email already exists. Sign in instead."],
      })
    case "email_address_invalid":
      return expected("VALIDATION", "Please check your email address.", {
        email: ["We can't send email to this address. Check it and try again."],
      })
    case "weak_password":
      return expected("VALIDATION", "Please choose a stronger password.", {
        password: ["This password is too weak or too common. Choose a different one."],
      })
    case "same_password":
      return expected("VALIDATION", "Please choose a new password.", {
        password: ["Choose a password different from your current one."],
      })
    case "signup_disabled":
    case "email_provider_disabled":
      return expected("FORBIDDEN", "New sign-ups are currently closed.")
    case "user_banned":
      return expected("FORBIDDEN", "This account has been suspended. Contact support for help.")
    case "reauthentication_needed":
    case "reauthentication_not_valid":
      return expected(
        "FORBIDDEN",
        "For your security, sign out and sign in again before changing your password."
      )
    case "session_not_found":
    case "session_expired":
      return expected("UNAUTHENTICATED", "Your session has expired. Please sign in again.")
  }

  // Older Auth servers omit `code` for bad credentials.
  if (operation === "sign_in" && error.message === "Invalid login credentials") {
    return expected("UNAUTHENTICATED", "Incorrect email or password.")
  }

  return new AppError("INTERNAL", `Auth ${operation} failed`, { cause: error, context })
}
