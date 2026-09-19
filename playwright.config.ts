import { existsSync } from "node:fs"
import { defineConfig, devices } from "@playwright/test"

// Give the test process the same configuration as the app (Supabase URL and
// keys for e2e/support). Values already in the environment (CI) win.
for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file)
}

const PORT = Number(process.env.PORT ?? 3000)
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`
const isCI = Boolean(process.env.CI)

/**
 * E2E tests run against a real Next server.
 * - CI: `npm run build` first; Playwright then starts `next start`.
 * - Local: starts `next dev`, or reuses a server already on the port.
 * - PLAYWRIGHT_BASE_URL: test an existing deployment (e.g. a Vercel preview).
 *
 * e2e/smoke.spec.ts needs nothing else. e2e/auth.spec.ts needs Supabase
 * (`npm run db:start`); it skips without one unless E2E_REQUIRE_SUPABASE=1.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  // `next dev` compiles each route on first visit, so allow for cold starts.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: isCI ? "npm run start" : "npm run dev",
        url: `${baseURL}/api/health`,
        reuseExistingServer: !isCI,
        timeout: 120_000,
      },
})
