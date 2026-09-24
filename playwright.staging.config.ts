import { defineConfig, devices } from "@playwright/test"
import { stagingTargetProblems } from "./e2e/support/targets"

/**
 * The staging smoke (e2e-staging/): a short journey through the real hosted
 * stack (Vercel, Supabase Auth with email confirmation, Resend, Turnstile's
 * test keys). Manual only, from the "Staging smoke" workflow in the GitHub
 * Environment "staging" (or by hand with the same variables); never on pull
 * requests, never against production.
 *
 * Guards, before any test: the base URL must be exactly STAGING_APP_URL over
 * https, not PRODUCTION_APP_URL, the Supabase project must be hosted and not
 * PRODUCTION_SUPABASE_URL (e2e/support/targets.ts); then the global setup
 * checks that /api/health reports `staging`. The suite creates its own
 * `delivered+e2e-staging-…@resend.dev` users and deletes exactly those.
 */
const problems = stagingTargetProblems(process.env)
if (problems.length > 0) {
  throw new Error(`Refusing to run the staging smoke:\n- ${problems.join("\n- ")}`)
}

const isCI = Boolean(process.env.CI)

export default defineConfig({
  testDir: "./e2e-staging",
  testMatch: "**/*.spec.ts",
  globalSetup: "./e2e-staging/global-setup.ts",
  // One journey, in order, on a shared environment: no parallelism, no retries
  // (a retry would create more users and mask a real failure).
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: isCI,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: isCI
    ? [["github"], ["html", { open: "never", outputFolder: "playwright-report-staging" }]]
    : [["list"]],
  outputDir: "test-results-staging",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? process.env.STAGING_APP_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "staging", use: { ...devices["Desktop Chrome"] } }],
})
