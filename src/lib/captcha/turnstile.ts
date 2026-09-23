import type { CaptchaAction } from "./shared"

/**
 * Server-side Turnstile verification (siteverify). Pure apart from `fetch`,
 * which tests replace. The browser's token is only a claim: it counts once
 * Cloudflare confirms it with our secret, for the action we expect.
 */

export const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

export type CaptchaVerdict =
  | { ok: true }
  | {
      ok: false
      reason: "missing_token" | "rejected" | "wrong_action" | "unavailable"
      /** Cloudflare's error codes (never includes the token or secret). */
      errorCodes?: string[]
    }

type SiteverifyResponse = {
  success?: boolean
  action?: string
  "error-codes"?: unknown
}

// Turnstile tokens are at most 2048 characters.
const MAX_TOKEN_LENGTH = 2048

export async function verifyTurnstileToken(
  input: {
    secret: string
    token: unknown
    expectedAction: CaptchaAction
    remoteIp?: string | null
  },
  fetchImpl: typeof fetch = fetch
): Promise<CaptchaVerdict> {
  const { token } = input
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
    return { ok: false, reason: "missing_token" }
  }

  const body = new URLSearchParams({ secret: input.secret, response: token })
  if (input.remoteIp) body.set("remoteip", input.remoteIp)

  let result: SiteverifyResponse
  try {
    const response = await fetchImpl(TURNSTILE_VERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    })
    if (!response.ok)
      return { ok: false, reason: "unavailable", errorCodes: [`http_${response.status}`] }
    result = (await response.json()) as SiteverifyResponse
  } catch {
    // Network failure or timeout: fail closed, it's a security check.
    return { ok: false, reason: "unavailable" }
  }

  const errorCodes = Array.isArray(result["error-codes"])
    ? result["error-codes"].filter((code): code is string => typeof code === "string")
    : []
  if (result.success !== true) return { ok: false, reason: "rejected", errorCodes }
  if (result.action !== input.expectedAction) return { ok: false, reason: "wrong_action" }
  return { ok: true }
}
