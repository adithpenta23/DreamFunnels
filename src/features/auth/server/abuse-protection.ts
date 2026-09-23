import "server-only"

import { headers } from "next/headers"
import { verifyTurnstileToken } from "@/lib/captcha/turnstile"
import type { CaptchaAction } from "@/lib/captcha/shared"
import { serverEnv } from "@/lib/env/server"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { rateLimit, type RateLimitPolicy, type RateLimitResult } from "@/lib/rate-limit"
import { clientIpFromHeaders, ipRateLimitSubject } from "@/lib/request-ip"

/**
 * Abuse controls for the public auth forms, applied by the Server Actions
 * before Supabase is called.
 *
 * Why in the app: every Auth request reaches Supabase from our server, so
 * Supabase's per-IP limits see one IP for all our visitors. The app knows the
 * real client IP (and the email being targeted) and limits both.
 */

type AuthLimits = { ip: RateLimitPolicy; email: RateLimitPolicy }

/**
 * Per-IP limits stop one source from spraying many accounts; per-email limits
 * stop many sources from hammering one account (or one inbox). Change the
 * numbers here; `name` is part of the stored key.
 *
 * Order in each action: per-IP limit, then CAPTCHA (where required), then the
 * per-email limit. Sign-in has no CAPTCHA, so its per-email limit is the
 * classic trade-off: it caps guessing on one account, and anyone can use it
 * to lock that account's sign-in for at most one window.
 */
export const AUTH_RATE_LIMITS = {
  signIn: {
    ip: { name: "auth.sign_in.ip", limit: 30, windowSeconds: 10 * 60 },
    email: { name: "auth.sign_in.email", limit: 10, windowSeconds: 15 * 60 },
  },
  // Also covers "resend confirmation email": both send the same email.
  signUp: {
    ip: { name: "auth.sign_up.ip", limit: 10, windowSeconds: 60 * 60 },
    email: { name: "auth.sign_up.email", limit: 5, windowSeconds: 60 * 60 },
  },
  passwordReset: {
    ip: { name: "auth.password_reset.ip", limit: 10, windowSeconds: 60 * 60 },
    email: { name: "auth.password_reset.email", limit: 5, windowSeconds: 60 * 60 },
  },
} as const satisfies Record<string, AuthLimits>

export type AuthRateLimitedAction = keyof typeof AUTH_RATE_LIMITS

async function requestIp(): Promise<string | null> {
  return clientIpFromHeaders(await headers())
}

function retryMessage(seconds: number): string {
  const minutes = Math.ceil(seconds / 60)
  return minutes <= 1
    ? "Too many attempts. Please wait a minute and try again."
    : `Too many attempts. Please wait ${minutes} minutes and try again.`
}

function throwIfBlocked(action: AuthRateLimitedAction, result: RateLimitResult) {
  if (result.allowed) return
  // Policy name and timing only: never the email or the IP.
  logger.warn("security.rate_limit_blocked", {
    action,
    policy: result.policy,
    retryAfterSeconds: result.retryAfterSeconds,
  })
  throw new AppError("RATE_LIMITED", retryMessage(result.retryAfterSeconds), {
    expose: true,
    context: { policy: result.policy },
  })
}

/**
 * Counts this attempt against the action's per-IP budget; throws RATE_LIMITED
 * when it's spent. Run it first: it's the cheap guard in front of everything
 * else, including the CAPTCHA check.
 */
export async function limitAuthByIp(action: AuthRateLimitedAction): Promise<void> {
  const ip = await requestIp()
  if (!ip) {
    // Only when the platform sends no client IP (misconfigured proxy): the
    // per-email limit and CAPTCHA still apply.
    logger.warn("security.client_ip_unknown", { action })
    return
  }
  throwIfBlocked(action, await rateLimit(AUTH_RATE_LIMITS[action].ip, ipRateLimitSubject(ip)))
}

/**
 * Counts this attempt against the per-email budget (`email` validated and
 * normalised). Where a CAPTCHA applies, call this after it: otherwise anyone
 * could spend a stranger's budget for free and lock them out of the action.
 */
export async function limitAuthByEmail(
  action: AuthRateLimitedAction,
  email: string
): Promise<void> {
  throwIfBlocked(action, await rateLimit(AUTH_RATE_LIMITS[action].email, email))
}

let loggedCaptchaDisabled = false

/**
 * Verifies the form's Turnstile token with Cloudflare. Throws a generic error
 * when it fails. A no-op only when no secret is configured, which the env
 * contract allows in local development and tests alone.
 */
export async function requireHuman(token: unknown, action: CaptchaAction): Promise<void> {
  const secret = serverEnv.TURNSTILE_SECRET_KEY
  if (!secret) {
    if (!loggedCaptchaDisabled) {
      loggedCaptchaDisabled = true
      logger.info("security.captcha_disabled", { reason: "TURNSTILE_SECRET_KEY is not set" })
    }
    return
  }

  const verdict = await verifyTurnstileToken({
    secret,
    token,
    expectedAction: action,
    remoteIp: await requestIp(),
  })
  if (verdict.ok) return

  const context = { action, reason: verdict.reason, errorCodes: verdict.errorCodes }
  if (verdict.reason === "unavailable") logger.error("security.captcha_unavailable", context)
  else logger.warn("security.captcha_failed", context)

  throw new AppError(
    "FORBIDDEN",
    "We couldn't confirm you're human. Please complete the security check and try again.",
    { expose: true, context }
  )
}
