/**
 * CAPTCHA pieces shared by the widget (browser) and the verifier (server).
 * Cloudflare Turnstile: https://developers.cloudflare.com/turnstile/
 */

/** Form field the widget writes its token into (Turnstile's default). */
export const CAPTCHA_FIELD = "cf-turnstile-response"

/**
 * Which form a token was issued for. The server rejects a token minted for a
 * different action, so a solved sign-up challenge can't be replayed elsewhere.
 */
export const CAPTCHA_ACTIONS = ["signup", "password_reset"] as const
export type CaptchaAction = (typeof CAPTCHA_ACTIONS)[number]

export const TURNSTILE_SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
