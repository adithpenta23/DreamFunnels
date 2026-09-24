import {
  EMAIL_SEND_TIMEOUT_MS,
  failureReasonForStatus,
  type EmailProvider,
  type EmailSendResult,
} from "./types"

/**
 * Mailpit, the mail catcher in the local Supabase stack (`npm run db:start`,
 * and CI). Messages go to its HTTP send API and show up at its web UI instead
 * of anyone's inbox; E2E tests read them back through its API. Local only: the
 * env contract refuses it when hosted.
 */

export const DEFAULT_MAILPIT_URL = "http://127.0.0.1:54324"

type MailpitOptions = {
  url?: string
  fetch?: typeof fetch
  timeoutMs?: number
}

export function createMailpitProvider({
  url = DEFAULT_MAILPIT_URL,
  fetch: fetchImpl = fetch,
  timeoutMs = EMAIL_SEND_TIMEOUT_MS,
}: MailpitOptions = {}): EmailProvider {
  const endpoint = new URL("/api/v1/send", url)

  return {
    name: "mailpit",
    async send(message): Promise<EmailSendResult> {
      let response: Response
      try {
        response = await fetchImpl(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            From: { Email: message.from.email, Name: message.from.name ?? "" },
            To: [{ Email: message.to.email, Name: message.to.name ?? "" }],
            Subject: message.subject,
            HTML: message.html,
            Text: message.text,
            Tags: message.tags ? Object.values(message.tags) : [],
          }),
          signal: AbortSignal.timeout(timeoutMs),
          cache: "no-store",
        })
      } catch {
        return { ok: false, reason: "unavailable" }
      }

      const body: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        return {
          ok: false,
          reason: failureReasonForStatus(response.status),
          status: response.status,
        }
      }
      const id =
        typeof body === "object" && body !== null && "ID" in body && typeof body.ID === "string"
          ? body.ID
          : null
      return { ok: true, messageId: id }
    },
  }
}
