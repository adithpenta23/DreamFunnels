/**
 * Liveness probe for uptime monitors, the E2E smoke test and the hosted gates
 * (`npm run verify:hosted`, the staging smoke). Intentionally has no
 * dependencies (no DB call) so an upstream outage doesn't make the app look
 * dead; add a separate readiness check if one is ever needed.
 *
 * `environment` (APP_ENV: local | staging | production) lets those gates
 * prove which deployment they reached before doing anything, e.g. the staging
 * smoke refuses to create test users on anything but staging. It's not a
 * secret: it only names the environment.
 */
export function GET() {
  return Response.json(
    {
      status: "ok",
      environment: process.env.APP_ENV || "local",
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
      timestamp: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } }
  )
}
