import { healthEnvironmentProblem } from "../e2e/support/targets"

/**
 * Before any staging test runs: the deployment at the base URL must say it's
 * staging (/api/health reports APP_ENV). A production app, a preview built
 * with the wrong APP_ENV, or an outage stops the run before a user is created.
 */
export default async function globalSetup() {
  const base = process.env.PLAYWRIGHT_BASE_URL ?? process.env.STAGING_APP_URL
  if (!base) throw new Error("STAGING_APP_URL is required.")
  const response = await fetch(new URL("/api/health", base), {
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`Staging health check answered HTTP ${response.status}.`)
  const problem = healthEnvironmentProblem(await response.json(), "staging")
  if (problem) throw new Error(problem)
}
