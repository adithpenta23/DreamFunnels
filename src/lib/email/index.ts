import "server-only"

import { serverEnv } from "@/lib/env/server"
import { createMailpitProvider } from "./mailpit"
import { createResendProvider } from "./resend"
import type { EmailAddress, EmailProvider } from "./types"

export type {
  EmailAddress,
  EmailFailureReason,
  EmailMessage,
  EmailProvider,
  EmailSendResult,
} from "./types"

/**
 * The configured transport: Resend when EMAIL_PROVIDER=resend (required when
 * hosted), otherwise the local stack's Mailpit. Adding a provider means one
 * more adapter file and one more case here; nothing else changes.
 */

const LOCAL_FROM_ADDRESS = "no-reply@dreamfunnels.test"
const DEFAULT_FROM_NAME = "DreamFunnels"

let provider: EmailProvider | null = null

export function emailProvider(): EmailProvider {
  if (!provider) {
    provider =
      serverEnv.EMAIL_PROVIDER === "resend" && serverEnv.RESEND_API_KEY
        ? createResendProvider({ apiKey: serverEnv.RESEND_API_KEY })
        : createMailpitProvider(serverEnv.MAILPIT_URL ? { url: serverEnv.MAILPIT_URL } : {})
  }
  return provider
}

/** Who transactional email comes from. Hosted environments must configure the address. */
export function emailSender(): EmailAddress {
  return {
    email: serverEnv.EMAIL_FROM_ADDRESS ?? LOCAL_FROM_ADDRESS,
    name: serverEnv.EMAIL_FROM_NAME ?? DEFAULT_FROM_NAME,
  }
}
