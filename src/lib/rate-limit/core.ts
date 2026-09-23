import { createHash } from "node:crypto"

/**
 * Provider-agnostic rate limiting. A policy says how many hits a subject (an
 * IP, an email) gets per fixed window; a store keeps the counters. Swapping
 * the backend (Postgres today; Redis/Upstash later) means writing one
 * RateLimitStore — callers never change.
 */

export type RateLimitPolicy = {
  /** Stable, dot-namespaced id, e.g. "auth.sign_in.email". Part of the storage key. */
  name: string
  /** Hits allowed per window. */
  limit: number
  windowSeconds: number
}

export type RateLimitResult = {
  allowed: boolean
  policy: string
  limit: number
  remaining: number
  /** When the current window ends and the budget refills. */
  resetAt: Date
  retryAfterSeconds: number
  /** True when the store failed and the request was let through (fail open). */
  degraded: boolean
}

export interface RateLimitStore {
  readonly name: string
  /** Records one hit for `key` and returns the hits in its current window. */
  hit(key: string, windowSeconds: number): Promise<{ hits: number; windowEndsAt: Date }>
}

type LimiterOptions = {
  now?: () => number
  /** Called when the store fails; the request is then allowed. */
  onStoreError?: (error: unknown, policy: RateLimitPolicy) => void
}

/**
 * Keys carry a hash of the subject, never the subject itself, so no email or
 * IP address is stored or logged by the limiter.
 */
export function rateLimitKey(policy: RateLimitPolicy, subject: string): string {
  const digest = createHash("sha256").update(subject.trim().toLowerCase()).digest("hex")
  return `${policy.name}:${digest.slice(0, 32)}`
}

export function createRateLimiter(store: RateLimitStore, options: LimiterOptions = {}) {
  const now = options.now ?? Date.now

  return async function rateLimit(
    policy: RateLimitPolicy,
    subject: string
  ): Promise<RateLimitResult> {
    try {
      const { hits, windowEndsAt } = await store.hit(
        rateLimitKey(policy, subject),
        policy.windowSeconds
      )
      const allowed = hits <= policy.limit
      return {
        allowed,
        policy: policy.name,
        limit: policy.limit,
        remaining: Math.max(0, policy.limit - hits),
        resetAt: windowEndsAt,
        retryAfterSeconds: allowed
          ? 0
          : Math.max(1, Math.ceil((windowEndsAt.getTime() - now()) / 1000)),
        degraded: false,
      }
    } catch (error) {
      // Fail open: a limiter outage must not lock everyone out of signing in.
      options.onStoreError?.(error, policy)
      return {
        allowed: true,
        policy: policy.name,
        limit: policy.limit,
        remaining: policy.limit,
        resetAt: new Date(now() + policy.windowSeconds * 1000),
        retryAfterSeconds: 0,
        degraded: true,
      }
    }
  }
}

export type RateLimiter = ReturnType<typeof createRateLimiter>
