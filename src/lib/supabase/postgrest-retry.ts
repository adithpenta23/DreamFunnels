import { logger } from "@/lib/logger"

/**
 * Workaround for PostgREST's sporadic "JWT issued at future" (PGRST303).
 *
 * Before PostgREST v16.3 / v14.18 the server read the time from a cache that
 * could be badly stale (notably on the first request of a new connection), so
 * a freshly minted token, say right after sign-up, was rejected as issued in
 * the future. See https://github.com/PostgREST/postgrest/issues/5196 and
 * supabase/discussions#48123 (hosted projects report it too).
 *
 * Local and CI stacks run a fixed PostgREST (supabase/.temp/rest-version).
 * This covers hosted projects: PostgREST validates the JWT before running any
 * query, so retrying is safe for every method, reads and writes. An immediate
 * retry usually succeeds; a later one covers a cache that needs a refresh.
 *
 * Remove when every environment runs PostgREST >= 16.3 (or >= 14.18).
 */

const RETRY_DELAYS_MS = [200, 1_000] as const

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input
  if (input instanceof URL) return input.href
  return input.url
}

async function isClockSkewRejection(response: Response): Promise<boolean> {
  if (response.status !== 401) return false
  try {
    const body: unknown = await response.clone().json()
    return typeof body === "object" && body !== null && "code" in body && body.code === "PGRST303"
  } catch {
    return false
  }
}

export function withPostgrestClockRetry(
  baseFetch: typeof fetch = fetch,
  delaysMs: readonly number[] = RETRY_DELAYS_MS
): typeof fetch {
  return async (input, init) => {
    let response = await baseFetch(input, init)
    if (!requestUrl(input).includes("/rest/v1/")) return response

    for (const [attempt, delay] of delaysMs.entries()) {
      if (!(await isClockSkewRejection(response))) return response
      logger.warn("supabase.postgrest_clock_retry", { attempt: attempt + 1 })
      await new Promise((resolve) => setTimeout(resolve, delay))
      response = await baseFetch(input, init)
    }
    return response
  }
}
