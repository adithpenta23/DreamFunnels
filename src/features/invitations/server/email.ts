import "server-only"

import { routes } from "@/config/routes"
import { sendTransactionalEmail, type TransactionalEmailResult } from "@/features/email/server/send"
import type { EmailProvider } from "@/lib/email"
import { publicEnv } from "@/lib/env/public"
import type { InvitableRole } from "../schemas"

/**
 * The invitation email. The link is built from the configured app URL
 * (NEXT_PUBLIC_APP_URL), never from request headers, so a spoofed Host can't
 * point invitees at another site.
 */

export function invitationUrl(token: string, appUrl = publicEnv.NEXT_PUBLIC_APP_URL): string {
  return new URL(routes.invitation(token), appUrl).toString()
}

export type InvitationEmail = {
  invitationId: string
  token: string
  /** Part of the idempotency key: a retry of this exact send is a no-op at the provider. */
  tokenHash: string
  to: string
  role: InvitableRole
  workspaceId: string
  workspaceName: string
  timeZone: string
  inviterName: string
  message: string | null
  expiresAt: Date
}

export function sendInvitationEmail(
  email: InvitationEmail,
  options: { provider?: EmailProvider } = {}
): Promise<TransactionalEmailResult> {
  return sendTransactionalEmail(
    {
      to: email.to,
      template: "workspace-invitation",
      variables: {
        invitedEmail: email.to,
        workspaceName: email.workspaceName,
        inviterName: email.inviterName,
        role: email.role,
        acceptUrl: invitationUrl(email.token),
        expiresAt: email.expiresAt,
        timeZone: email.timeZone,
        message: email.message,
      },
      metadata: {
        // Derived from the hash, not the token: keys can show up in provider logs.
        idempotencyKey: `workspace-invitation:${email.invitationId}:${email.tokenHash.slice(0, 16)}`,
        context: { workspaceId: email.workspaceId, invitationId: email.invitationId },
      },
    },
    options
  )
}
