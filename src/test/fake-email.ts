import type { EmailMessage, EmailProvider, EmailSendResult } from "@/lib/email/types"

/**
 * An in-memory email provider for tests: records every message and can be told
 * to fail. Deliberately lives under src/test (never selectable by env), so it
 * can't end up sending — or silently swallowing — production email.
 */
export function createFakeEmailProvider(options: { fail?: EmailSendResult & { ok: false } } = {}) {
  const sent: EmailMessage[] = []
  let failure = options.fail ?? null

  const provider: EmailProvider & {
    sent: EmailMessage[]
    failWith: (result: (EmailSendResult & { ok: false }) | null) => void
  } = {
    name: "fake",
    sent,
    failWith(result) {
      failure = result
    },
    async send(message) {
      if (failure) return failure
      sent.push(message)
      return { ok: true, messageId: `fake-${sent.length}` }
    },
  }
  return provider
}
