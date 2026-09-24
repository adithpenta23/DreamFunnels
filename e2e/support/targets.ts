/**
 * Which deployment a browser suite may touch. Pure checks, used by the
 * Playwright configs before any test runs, and unit-tested
 * (e2e/support/targets.test.ts).
 *
 * - The local suites (e2e/) create and delete users and workspaces with the
 *   secret key, so they only ever run against this machine: a loopback app
 *   and a loopback Supabase.
 * - The staging smoke (e2e-staging/) runs only when its base URL is exactly
 *   the configured staging URL, over https, and never against production.
 *   It also checks /api/health reports `staging` before creating anything.
 */

type Env = Record<string, string | undefined>

export function isLoopbackUrl(value: string): boolean {
  try {
    const { hostname } = new URL(value)
    return (
      hostname === "localhost" ||
      hostname === "0.0.0.0" ||
      hostname === "[::1]" ||
      hostname.startsWith("127.") ||
      hostname.endsWith(".localhost")
    )
  } catch {
    return false
  }
}

const originOf = (value: string | undefined): string | null => {
  if (!value) return null
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

/** Problems that stop the local suites (empty = fine). */
export function localTargetProblems(env: Env): string[] {
  const problems: string[] = []
  if (env.PLAYWRIGHT_BASE_URL && !isLoopbackUrl(env.PLAYWRIGHT_BASE_URL)) {
    problems.push(
      "PLAYWRIGHT_BASE_URL points at another machine. The local E2E suites only run against this machine; use `npm run test:staging` for staging."
    )
  }
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
  if (supabaseUrl && !isLoopbackUrl(supabaseUrl)) {
    problems.push(
      "NEXT_PUBLIC_SUPABASE_URL is a hosted project. The local E2E suites create and delete users with the secret key, so they only run against the local stack (`npm run db:start`)."
    )
  }
  return problems
}

/** Problems that stop the staging smoke (empty = fine). */
export function stagingTargetProblems(env: Env): string[] {
  const problems: string[] = []
  const staging = originOf(env.STAGING_APP_URL)
  const base = originOf(env.PLAYWRIGHT_BASE_URL ?? env.STAGING_APP_URL)
  const production = originOf(env.PRODUCTION_APP_URL)
  const supabase = originOf(env.NEXT_PUBLIC_SUPABASE_URL)
  const productionSupabase = originOf(env.PRODUCTION_SUPABASE_URL)

  if (!staging) {
    problems.push("STAGING_APP_URL must be set to the staging app's URL.")
  } else {
    if (!staging.startsWith("https://")) problems.push("STAGING_APP_URL must use https.")
    if (isLoopbackUrl(staging)) problems.push("STAGING_APP_URL must not point at this machine.")
    if (base !== staging) {
      problems.push("The base URL must be exactly STAGING_APP_URL; refusing to test anything else.")
    }
    if (production && (staging === production || base === production)) {
      problems.push("The target is the production app URL; the staging smoke never runs there.")
    }
  }
  if (!supabase) {
    problems.push("NEXT_PUBLIC_SUPABASE_URL must be set to the staging Supabase project.")
  } else {
    if (!supabase.startsWith("https://") || isLoopbackUrl(supabase)) {
      problems.push("NEXT_PUBLIC_SUPABASE_URL must be the hosted staging project (https).")
    }
    if (productionSupabase && supabase === productionSupabase) {
      problems.push("NEXT_PUBLIC_SUPABASE_URL is the production project; refusing.")
    }
  }
  if (!env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    problems.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set (staging project).")
  }
  if (!env.SUPABASE_SECRET_KEY) {
    problems.push(
      "SUPABASE_SECRET_KEY must be set (staging project): the smoke creates and deletes its own test users."
    )
  }
  return problems
}

/** What /api/health must say before the staging smoke touches anything. */
export function healthEnvironmentProblem(body: unknown, expected: "staging"): string | null {
  const environment =
    typeof body === "object" && body !== null && "environment" in body
      ? (body as { environment: unknown }).environment
      : undefined
  return environment === expected
    ? null
    : `The app at the base URL reports environment ${JSON.stringify(environment ?? null)}, not "${expected}"; refusing.`
}
