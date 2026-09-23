import type { RateLimitStore } from "./core"

/**
 * In-process counters. Correct for one process only: on serverless hosts
 * each instance counts separately and forgets on cold start. Used by tests
 * and by local development without SUPABASE_SECRET_KEY — never in a hosted
 * environment (the env contract requires the secret key there).
 */
export function createMemoryStore({
  now = Date.now,
  maxKeys = 10_000,
}: { now?: () => number; maxKeys?: number } = {}): RateLimitStore {
  const counters = new Map<string, { hits: number; windowEndsAt: number }>()

  const prune = () => {
    const current = now()
    for (const [key, counter] of counters) {
      if (counter.windowEndsAt <= current) counters.delete(key)
    }
    // Still full of live windows: drop the oldest entries (insertion order).
    for (const key of counters.keys()) {
      if (counters.size < maxKeys) break
      counters.delete(key)
    }
  }

  return {
    name: "memory",
    async hit(key, windowSeconds) {
      const current = now()
      const existing = counters.get(key)
      if (existing && existing.windowEndsAt > current) {
        existing.hits += 1
        return { hits: existing.hits, windowEndsAt: new Date(existing.windowEndsAt) }
      }
      if (counters.size >= maxKeys) prune()
      const counter = { hits: 1, windowEndsAt: current + windowSeconds * 1000 }
      counters.set(key, counter)
      return { hits: 1, windowEndsAt: new Date(counter.windowEndsAt) }
    },
  }
}
