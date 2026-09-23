import "server-only"

import { serverEnv } from "@/lib/env/server"
import { logger } from "@/lib/logger"
import { reportError } from "@/lib/monitoring"
import { createAdminClient } from "@/lib/supabase/admin"
import { createRateLimiter, type RateLimiter, type RateLimitStore } from "./core"
import { createMemoryStore } from "./memory-store"
import { createPostgresStore } from "./postgres-store"

export type { RateLimitPolicy, RateLimitResult, RateLimitStore } from "./core"

/**
 * The app's rate limiter: `await rateLimit(policy, subject)`.
 *
 * Backend: Postgres when SUPABASE_SECRET_KEY is set (always, when hosted: the
 * env contract requires it), else an in-memory store for local development.
 * To move to another backend, implement RateLimitStore and return it here.
 */

let limiter: RateLimiter | null = null

function defaultStore(): RateLimitStore {
  if (serverEnv.SUPABASE_SECRET_KEY) return createPostgresStore(createAdminClient())
  logger.info("security.rate_limit_memory_store", {
    reason: "SUPABASE_SECRET_KEY is not set; counters are per process",
  })
  return createMemoryStore()
}

export function rateLimit(...args: Parameters<RateLimiter>): ReturnType<RateLimiter> {
  limiter ??= createRateLimiter(defaultStore(), {
    onStoreError: (error, policy) =>
      reportError(error, { event: "security.rate_limit_unavailable", policy: policy.name }),
  })
  return limiter(...args)
}
