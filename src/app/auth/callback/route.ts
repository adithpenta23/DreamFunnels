import type { EmailOtpType } from "@supabase/supabase-js"
import { NextResponse, type NextRequest } from "next/server"
import { routes } from "@/config/routes"
import { getSafeRedirectPath } from "@/features/auth/lib/redirect"
import {
  destinationAfterEmailLink,
  PENDING_INVITATION_COOKIE,
} from "@/features/invitations/lib/pending-invitation"
import { logger } from "@/lib/logger"
import { createClient } from "@/lib/supabase/server"

const EMAIL_OTP_TYPES: readonly EmailOtpType[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]

function isEmailOtpType(value: string | null): value is EmailOtpType {
  return value !== null && (EMAIL_OTP_TYPES as readonly string[]).includes(value)
}

/**
 * Completes an email link: signup confirmation, password recovery, email
 * change. Supports both link styles Supabase can send:
 * - PKCE (`?code=`): the default templates; must open in the same browser.
 * - Token hash (`?token_hash=&type=`): the templates in supabase/templates;
 *   works on any device.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code = searchParams.get("code")
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type")
  const next = getSafeRedirectPath(searchParams.get("next"))

  const supabase = await createClient()

  let failure: string | undefined
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    failure = error?.code ?? error?.message
  } else if (tokenHash && isEmailOtpType(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    failure = error?.code ?? error?.message
  } else {
    failure = "missing_code_or_token_hash"
  }

  if (failure === undefined) {
    // Someone who signed up from an invitation goes back to it once confirmed.
    const pendingInvitation = request.cookies.get(PENDING_INVITATION_COOKIE)?.value
    const response = NextResponse.redirect(
      new URL(destinationAfterEmailLink(next, pendingInvitation), request.url)
    )
    if (pendingInvitation !== undefined) response.cookies.delete(PENDING_INVITATION_COOKIE)
    return response
  }

  logger.warn("auth.callback_failed", { reason: failure, type })

  // A broken reset link goes back to "forgot password", where a new one can be requested.
  const isRecovery = type === "recovery" || next === routes.resetPassword
  const destination = isRecovery
    ? new URL(`${routes.forgotPassword}?error=reset_link_invalid`, request.url)
    : new URL(`${routes.login}?error=auth_callback_failed`, request.url)
  return NextResponse.redirect(destination)
}
