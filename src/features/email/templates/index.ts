import type { z } from "zod"
import { invitationEmailVariables, renderInvitationEmail } from "./invitation"

/**
 * Every transactional email the product sends. Each entry pairs a Zod schema
 * for its variables with a renderer; sendTransactionalEmail() validates before
 * rendering. Add appointment confirmations, reminders or review requests here
 * the same way. Templates live in code (reviewed, versioned, tested), not in
 * the database.
 */
export const EMAIL_TEMPLATES = {
  "workspace-invitation": {
    variables: invitationEmailVariables,
    render: renderInvitationEmail,
  },
} as const satisfies Record<
  string,
  {
    variables: z.ZodType
    render: (variables: never) => { subject: string; html: string; text: string }
  }
>

export type EmailTemplateName = keyof typeof EMAIL_TEMPLATES

export type EmailTemplateVariables<T extends EmailTemplateName> = z.input<
  (typeof EMAIL_TEMPLATES)[T]["variables"]
>

export type RenderedEmail = { subject: string; html: string; text: string }

/**
 * Validates the variables and renders the template, or explains which
 * variables are missing or invalid (by path, never by value).
 */
export function renderEmailTemplate<T extends EmailTemplateName>(
  template: T,
  variables: EmailTemplateVariables<T>
): { ok: true; email: RenderedEmail } | { ok: false; invalid: string[] } {
  const definition = EMAIL_TEMPLATES[template]
  const parsed = definition.variables.safeParse(variables)
  if (!parsed.success) {
    return { ok: false, invalid: parsed.error.issues.map((issue) => issue.path.join(".")) }
  }
  return { ok: true, email: definition.render(parsed.data) }
}
