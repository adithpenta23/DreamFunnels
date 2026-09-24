import "server-only"

import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { rateLimit, type RateLimitPolicy, type RateLimitResult } from "@/lib/rate-limit"

/**
 * Every invitation email (new or resent) spends from three budgets, so a
 * compromised or careless admin account can't turn the app into a spam relay:
 *   - per sender: one person's sending pace;
 *   - per workspace: a whole team's volume;
 *   - per recipient: nobody's inbox gets flooded, whichever workspaces invite them.
 * Checked before anything is written, so a blocked attempt changes nothing.
 * Change the numbers here; `name` is part of the stored key.
 */
export const INVITATION_RATE_LIMITS = {
  sender: { name: "invitations.send.user", limit: 30, windowSeconds: 60 * 60 },
  workspace: { name: "invitations.send.workspace", limit: 100, windowSeconds: 24 * 60 * 60 },
  recipient: { name: "invitations.send.recipient", limit: 5, windowSeconds: 60 * 60 },
} as const satisfies Record<string, RateLimitPolicy>

function throwIfBlocked(result: RateLimitResult) {
  if (result.allowed) return
  logger.warn("security.rate_limit_blocked", {
    action: "invitations.send",
    policy: result.policy,
    retryAfterSeconds: result.retryAfterSeconds,
  })
  const minutes = Math.ceil(result.retryAfterSeconds / 60)
  throw new AppError(
    "RATE_LIMITED",
    minutes <= 1
      ? "Too many invitations sent. Please wait a minute and try again."
      : `Too many invitations sent. Please wait ${minutes} minutes and try again.`,
    { expose: true, context: { policy: result.policy } }
  )
}

export async function limitInvitationEmails(subjects: {
  senderId: string
  workspaceId: string
  recipientEmail: string
}): Promise<void> {
  throwIfBlocked(await rateLimit(INVITATION_RATE_LIMITS.sender, subjects.senderId))
  throwIfBlocked(await rateLimit(INVITATION_RATE_LIMITS.workspace, subjects.workspaceId))
  throwIfBlocked(await rateLimit(INVITATION_RATE_LIMITS.recipient, subjects.recipientEmail))
}
