import type { NextConfig } from "next"
import { parseDeploymentEnv } from "./src/lib/env/schema"

// Fail the build (and `next dev` startup) on missing/invalid configuration
// instead of at the first request in production. Staging and production
// builds also fail without the CAPTCHA, rate-limit and https settings.
parseDeploymentEnv(process.env)

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The app itself is never framed. Published funnels (future) will be served
  // with their own headers so customers can embed them.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
]

const nextConfig: NextConfig = {
  typedRoutes: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }]
  },
}

export default nextConfig
