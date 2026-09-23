import { existsSync } from "node:fs"
import { defineConfig, devices } from "@playwright/test"

// Give the test process the same configuration as the app (Supabase URL and
// keys for e2e/support). Values already in the environment (CI) win.
for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file)
}

const PORT = Number(process.env.PORT ?? 3000)
// A client IP per worker (198.18.0.0/15 is reserved for testing), so the app's
// per-IP auth rate limits don't carry over between runs. Specs that sign in
// also give each test its own (e2e/support/client-ip.ts).
const workerClientIp = `198.19.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`
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
  // Locally, `next dev` compiles routes on demand and every sign-up hashes a password in the
  // Auth container; more than two parallel browsers saturates a laptop that also runs Docker.
  // Pass --workers to override.
  workers: isCI ? 1 : 2,
  // `next dev` compiles each route on first visit, so allow for cold starts.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    extraHTTPHeaders: { "x-forwarded-for": workerClientIp },
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
