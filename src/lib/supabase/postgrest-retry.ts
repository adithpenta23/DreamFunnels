import { logger } from "@/lib/logger"

/**
 * Workaround for PostgREST's sporadic "JWT issued at future" (PGRST303).
 *
 * Before PostgREST v16.3 / v14.18 its clock was cached and refreshed once a
 * second, so a token minted in the current second (say, right after sign-up
 * or sign-in) could be rejected as issued in the future. See
 * https://github.com/PostgREST/postgrest/issues/5196. The Supabase CLI still
 * ships v16.2, and hosted projects may run affected versions.
 *
 * PostgREST validates the JWT before running any query, so retrying once
 * after the clock has caught up is safe for every method, reads and writes.
 *
 * Remove when every environment runs PostgREST >= 16.3 (or >= 14.18).
 */

const RETRY_DELAY_MS = 1_000

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
  delayMs: number = RETRY_DELAY_MS
): typeof fetch {
  return async (input, init) => {
    const response = await baseFetch(input, init)
    if (!requestUrl(input).includes("/rest/v1/") || !(await isClockSkewRejection(response))) {
      return response
    }
    logger.warn("supabase.postgrest_clock_retry")
    await new Promise((resolve) => setTimeout(resolve, delayMs))
    return baseFetch(input, init)
  }
}
