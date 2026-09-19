/**
 * Liveness probe for uptime monitors and the E2E smoke test. Intentionally
 * has no dependencies (no DB call) so an upstream outage doesn't make the app
 * look dead; add a separate readiness check if one is ever needed.
 */
export function GET() {
  return Response.json(
    {
      status: "ok",
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
      timestamp: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } }
  )
}
