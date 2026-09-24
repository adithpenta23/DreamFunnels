import "server-only"

import {
  emailProvider,
  emailSender,
  type EmailAddress,
  type EmailFailureReason,
  type EmailProvider,
} from "@/lib/email"
import { logger } from "@/lib/logger"
import {
  renderEmailTemplate,
  type EmailTemplateName,
  type EmailTemplateVariables,
} from "../templates"

/**
 * Sends one transactional email: validate the template's variables, render
 * it, hand it to the configured provider, log the outcome.
 *
 * It never throws for delivery problems: the result says whether the provider
 * accepted the message, so the caller can record it and tell the user the
 * truth ("sent" only when it was). Invalid variables are a bug, reported as a
 * failure without sending anything.
 *
 * Logs carry the template, provider and outcome: never the recipient, the
 * content or links (which can hold tokens).
 */

export type TransactionalEmailRequest<T extends EmailTemplateName> = {
  to: string
  template: T
  variables: EmailTemplateVariables<T>
  metadata?: {
    /** Dedupe key for provider-side retries (see EmailMessage.idempotencyKey). */
    idempotencyKey?: string
    /** Structured, non-personal context for logs, e.g. { workspaceId }. */
    context?: Record<string, string>
  }
}

export type TransactionalEmailResult =
  | { ok: true; provider: string; messageId: string | null }
  | { ok: false; provider: string; reason: EmailFailureReason | "invalid_variables" }

type SendOptions = {
  /** Tests inject a fake; production code uses the configured provider. */
  provider?: EmailProvider
  from?: EmailAddress
}

export async function sendTransactionalEmail<T extends EmailTemplateName>(
  request: TransactionalEmailRequest<T>,
  options: SendOptions = {}
): Promise<TransactionalEmailResult> {
  const provider = options.provider ?? emailProvider()
  const context = {
    template: request.template,
    provider: provider.name,
    ...request.metadata?.context,
  }

  const rendered = renderEmailTemplate(request.template, request.variables)
  if (!rendered.ok) {
    logger.error("email.invalid_variables", { ...context, invalid: rendered.invalid })
    return { ok: false, provider: provider.name, reason: "invalid_variables" }
  }

  const result = await provider.send({
    from: options.from ?? emailSender(),
    to: { email: request.to },
    ...rendered.email,
    idempotencyKey: request.metadata?.idempotencyKey,
    tags: { template: request.template },
  })

  if (result.ok) {
    logger.info("email.sent", { ...context, messageId: result.messageId })
    return { ok: true, provider: provider.name, messageId: result.messageId }
  }

  const failure = { ...context, reason: result.reason, status: result.status, code: result.code }
  // Our own configuration is broken: that needs a human, not a retry.
  if (result.reason === "misconfigured") logger.error("email.failed", failure)
  else logger.warn("email.failed", failure)
  return { ok: false, provider: provider.name, reason: result.reason }
}
