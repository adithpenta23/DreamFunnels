/**
 * Transactional email transport, provider-agnostic. A provider turns one
 * rendered message into one delivery attempt and reports the outcome; it never
 * throws for delivery failures, so callers can't forget to handle them.
 *
 * Business code doesn't use this directly: it calls a feature function such as
 * `sendInvitationEmail()`, which renders a template and sends it through
 * features/email (sendTransactionalEmail).
 */

export type EmailAddress = {
  email: string
  /** Display name. Never user-controlled free text in the From header. */
  name?: string | undefined
}

export type EmailMessage = {
  from: EmailAddress
  to: EmailAddress
  subject: string
  html: string
  text: string
  /**
   * Makes a retried request for the same logical email a no-op at the provider
   * (Resend keeps keys for 24 hours). Derive it from what the email is about,
   * never from secrets.
   */
  idempotencyKey?: string | undefined
  /** Non-personal labels for the provider's dashboard, e.g. { template: "workspace_invitation" }. */
  tags?: Readonly<Record<string, string>> | undefined
}

/**
 * Why a send failed, coarse enough to act on:
 * - `rejected`: the provider refused this message (validation, bad address).
 * - `rate_limited`: quota or rate limit; worth retrying later.
 * - `unavailable`: network error, timeout or provider outage; worth retrying.
 * - `misconfigured`: our side (API key, unverified sending domain).
 */
export type EmailFailureReason = "rejected" | "rate_limited" | "unavailable" | "misconfigured"

export type EmailSendResult =
  | { ok: true; messageId: string | null }
  | {
      ok: false
      reason: EmailFailureReason
      /** HTTP status from the provider, if it answered. */
      status?: number | undefined
      /** The provider's machine-readable error name (never its message, which can echo addresses). */
      code?: string | undefined
    }

export interface EmailProvider {
  readonly name: string
  send(message: EmailMessage): Promise<EmailSendResult>
}

/** How long to wait for a provider before giving up (the user can resend). */
export const EMAIL_SEND_TIMEOUT_MS = 10_000

/** Maps an HTTP status from a provider API to a failure reason. */
export function failureReasonForStatus(status: number): EmailFailureReason {
  if (status === 401 || status === 403) return "misconfigured"
  if (status === 429) return "rate_limited"
  if (status >= 500 || status === 408 || status === 409) return "unavailable"
  return "rejected"
}
