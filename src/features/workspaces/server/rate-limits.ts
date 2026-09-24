import "server-only"

import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { rateLimit, type RateLimitPolicy } from "@/lib/rate-limit"

/**
 * Creating client workspaces is cheap for a person and costly in bulk
 * (storage, and a spam vector once workspaces send email), so each person
 * gets a generous hourly budget.
 */
export const CLIENT_CREATION_LIMIT = {
  name: "workspaces.create_client.user",
  limit: 50,
  windowSeconds: 60 * 60,
} as const satisfies RateLimitPolicy

export async function limitClientCreation(userId: string): Promise<void> {
  const result = await rateLimit(CLIENT_CREATION_LIMIT, userId)
  if (result.allowed) return
  logger.warn("security.rate_limit_blocked", {
    action: "workspaces.create_client",
    policy: result.policy,
    retryAfterSeconds: result.retryAfterSeconds,
  })
  throw new AppError(
    "RATE_LIMITED",
    "You've added a lot of clients in a short time. Please wait a few minutes and try again.",
    { expose: true, context: { policy: result.policy } }
  )
}
