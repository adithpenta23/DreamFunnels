import { test } from "@playwright/test"

/**
 * A random address in 198.18.0.0/15, the range reserved for network testing.
 *
 * The app rate-limits auth per client IP, and every browser here would
 * otherwise share 127.0.0.1. Sending a per-test X-Forwarded-For keeps tests
 * (and repeated local runs) from spending each other's budget. This only
 * works against `next dev`/`next start`, which keep a client-supplied value;
 * Vercel overwrites the header, so preview runs share the runner's real IP.
 */
export function testClientIp(): string {
  const n = Math.floor(Math.random() * 2 ** 17)
  return `198.${18 + (n >> 16)}.${(n >> 8) & 255}.${n & 255}`
}

/** Call at the top of a spec: each test's browser context gets its own client IP. */
export function giveEachTestItsOwnIp() {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders({ "x-forwarded-for": testClientIp() })
  })
}
