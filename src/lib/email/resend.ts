import {
  EMAIL_SEND_TIMEOUT_MS,
  failureReasonForStatus,
  type EmailAddress,
  type EmailProvider,
  type EmailSendResult,
} from "./types"

/**
 * Resend over its REST API (https://resend.com/docs/api-reference/emails/send-email),
 * with plain fetch: one POST doesn't justify an SDK, and keeping provider
 * types out of the app keeps business code provider-agnostic.
 */

const RESEND_EMAILS_ENDPOINT = "https://api.resend.com/emails"

/** RFC 5322 "specials": a display name containing any of them must be quoted. */
const NEEDS_QUOTES = /[()<>[\]:;@\\,."]/

/** `Name <email>`, quoting (and stripping quotes and line breaks from) the name. */
export function formatAddress({ email, name }: EmailAddress): string {
  const cleanName = name?.replace(/["\\\r\n]/g, "").trim()
  if (!cleanName) return email
  return NEEDS_QUOTES.test(cleanName) ? `"${cleanName}" <${email}>` : `${cleanName} <${email}>`
}

/** Resend tag names and values: ASCII letters, numbers, underscores or dashes, ≤ 256. */
const toTagPart = (value: string) => value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 256)

type ResendOptions = {
  apiKey: string
  fetch?: typeof fetch
  timeoutMs?: number
}

export function createResendProvider({
  apiKey,
  fetch: fetchImpl = fetch,
  timeoutMs = EMAIL_SEND_TIMEOUT_MS,
}: ResendOptions): EmailProvider {
  return {
    name: "resend",
    async send(message): Promise<EmailSendResult> {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      }
      if (message.idempotencyKey) headers["Idempotency-Key"] = message.idempotencyKey.slice(0, 256)

      let response: Response
      try {
        response = await fetchImpl(RESEND_EMAILS_ENDPOINT, {
          method: "POST",
          headers,
          body: JSON.stringify({
            from: formatAddress(message.from),
            to: [message.to.email],
            subject: message.subject,
            html: message.html,
            text: message.text,
            ...(message.tags
              ? {
                  tags: Object.entries(message.tags).map(([name, value]) => ({
                    name: toTagPart(name),
                    value: toTagPart(value),
                  })),
                }
              : {}),
          }),
          signal: AbortSignal.timeout(timeoutMs),
          cache: "no-store",
        })
      } catch {
        // Network failure or timeout. The error itself can carry request
        // details, so only the reason is reported.
        return { ok: false, reason: "unavailable" }
      }

      const body: unknown = await response.json().catch(() => null)
      if (response.ok) {
        const id = isRecord(body) && typeof body.id === "string" ? body.id : null
        return { ok: true, messageId: id }
      }
      return {
        ok: false,
        reason: failureReasonForStatus(response.status),
        status: response.status,
        code: errorName(body),
      }
    },
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

/** Resend's error `name` (e.g. "validation_error"); its `message` is never kept. */
function errorName(body: unknown): string | undefined {
  if (!isRecord(body) || typeof body.name !== "string") return undefined
  return /^[a-z_]{1,64}$/.test(body.name) ? body.name : undefined
}
