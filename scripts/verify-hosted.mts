/**
 * The hosted gate: checks a staging or production deployment from the
 * outside, with public endpoints and the publishable key only. Run by the
 * Deploy database workflow after migrating, and by hand after a deploy.
 *
 * Supabase (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY):
 *   - the project URL is https and not this machine;
 *   - email sign-up is on and requires confirmation (`mailer_autoconfirm`
 *     false), so unconfirmed sign-ups can't get in;
 *   - JWTs are signed with an asymmetric key (the JWKS lists an EC/RSA/OKP
 *     key), so getClaims() verifies locally and no shared secret mints sessions.
 * App (NEXT_PUBLIC_APP_URL; skipped only with --auth-only):
 *   - https and not this machine;
 *   - /api/health answers ok, uncached, and names the environment
 *     (VERIFY_EXPECT_APP_ENV=staging|production pins which one);
 *   - the security headers are on every response and X-Powered-By is off
 *     (HSTS is a warning: the host adds it, not the app);
 *   - /auth/callback turns a bogus email link into a same-site redirect to
 *     the login error, without a session cookie;
 *   - an invitation link with a random token is uncached and not indexed.
 *
 * What it can't see (dashboard-only settings: Site URL, redirect allow-list,
 * SMTP, templates, password length, Turnstile hostnames, rate limits,
 * delivered email) is listed in docs/DEPLOYMENT.md as manual checks.
 *
 * Usage (values from the target environment, e.g. a GitHub environment):
 *   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co \
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_... \
 *   NEXT_PUBLIC_APP_URL=https://staging.example.com \
 *   VERIFY_EXPECT_APP_ENV=staging \
 *   npm run verify:hosted            # or: npm run verify:hosted -- --auth-only
 *
 * Exits 1 when any check fails (a skipped app section is reported, never
 * counted as a pass). Never prints keys, tokens or cookie values.
 */

import { randomBytes } from "node:crypto"
import { pathToFileURL } from "node:url"

export type CheckStatus = "pass" | "fail" | "warn"
export type CheckResult = { name: string; status: CheckStatus; detail: string }

type Env = Record<string, string | undefined>

const pass = (name: string, detail: string): CheckResult => ({ name, status: "pass", detail })
const fail = (name: string, detail: string): CheckResult => ({ name, status: "fail", detail })
const warn = (name: string, detail: string): CheckResult => ({ name, status: "warn", detail })

const ASYMMETRIC_KEY_TYPES = new Set(["EC", "RSA", "OKP"])
const EXPECTED_HEADERS: readonly [string, (value: string) => boolean, string][] = [
  ["x-content-type-options", (value) => value === "nosniff", "nosniff"],
  [
    "referrer-policy",
    (value) => value === "strict-origin-when-cross-origin",
    "strict-origin-when-cross-origin",
  ],
  ["x-frame-options", (value) => value.toUpperCase() === "DENY", "DENY"],
  ["permissions-policy", (value) => value.includes("camera=()"), "camera=(), …"],
]

const isLoopback = (url: URL) =>
  url.hostname === "localhost" ||
  url.hostname === "0.0.0.0" ||
  url.hostname === "[::1]" ||
  url.hostname.startsWith("127.")

export function checkHostedUrl(name: string, value: string | undefined): CheckResult {
  if (!value) return fail(name, "Not set.")
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return fail(name, "Not a valid URL.")
  }
  if (url.protocol !== "https:") return fail(name, `${url.host} isn't served over https.`)
  if (isLoopback(url)) return fail(name, `${url.host} is this machine, not a hosted deployment.`)
  return pass(name, `https://${url.host}`)
}

export function checkAuthSettings(settings: unknown): CheckResult {
  const name = "Email confirmation required"
  if (typeof settings !== "object" || settings === null || !("mailer_autoconfirm" in settings)) {
    return fail(name, "Auth settings didn't include mailer_autoconfirm.")
  }
  return settings.mailer_autoconfirm === false
    ? pass(name, "Confirm email is on.")
    : fail(
        name,
        'Confirm email is OFF. Dashboard: Authentication -> Sign In / Providers -> Email -> enable "Confirm email".'
      )
}

export function checkEmailSignup(settings: unknown): CheckResult {
  const name = "Email sign-up enabled"
  if (typeof settings !== "object" || settings === null) {
    return fail(name, "Auth settings weren't an object.")
  }
  const { disable_signup: disableSignup, external } = settings as {
    disable_signup?: unknown
    external?: { email?: unknown }
  }
  if (disableSignup !== false) {
    return fail(
      name,
      "New sign-ups are disabled. Dashboard: Authentication -> Sign In / Providers."
    )
  }
  if (external?.email !== true) {
    return fail(
      name,
      "The Email provider is off. Dashboard: Authentication -> Sign In / Providers -> Email."
    )
  }
  return pass(name, "Email and password sign-up is on.")
}

export function checkSigningKeys(jwks: unknown): CheckResult {
  const name = "Asymmetric JWT signing key"
  const keys =
    typeof jwks === "object" && jwks !== null && "keys" in jwks && Array.isArray(jwks.keys)
      ? (jwks.keys as unknown[])
      : null
  if (!keys) return fail(name, "The JWKS endpoint returned no key list.")

  const types = keys.flatMap((key) =>
    typeof key === "object" && key !== null && "kty" in key && typeof key.kty === "string"
      ? [key.kty]
      : []
  )
  return types.some((type) => ASYMMETRIC_KEY_TYPES.has(type))
    ? pass(name, `Published key types: ${[...new Set(types)].join(", ")}.`)
    : fail(
        name,
        "No asymmetric key is published (legacy HS256 secret only). Dashboard: Project Settings -> JWT Keys -> migrate to JWT signing keys, then rotate to the new key."
      )
}

/** A response as the checks see it: nothing but status, headers and text. */
export type Probe = {
  status: number
  headers: Headers
  body: string
  setCookies: string[]
}

export function checkHealth(probe: Probe, expectedEnv: string | undefined): CheckResult {
  const name = "Health endpoint"
  if (probe.status !== 200) return fail(name, `/api/health answered HTTP ${probe.status}.`)
  let body: { status?: unknown; environment?: unknown; version?: unknown }
  try {
    body = JSON.parse(probe.body) as typeof body
  } catch {
    return fail(name, "/api/health didn't answer JSON.")
  }
  if (body.status !== "ok") return fail(name, "/api/health didn't report status ok.")
  if (!probe.headers.get("cache-control")?.includes("no-store")) {
    return fail(name, "/api/health is cacheable (expected Cache-Control: no-store).")
  }
  const environment = typeof body.environment === "string" ? body.environment : null
  if (expectedEnv && environment !== expectedEnv) {
    return fail(
      name,
      `The app says it's ${JSON.stringify(environment)}, expected "${expectedEnv}". Check APP_ENV.`
    )
  }
  if (!expectedEnv && environment !== "staging" && environment !== "production") {
    return fail(
      name,
      `The app says it's ${JSON.stringify(environment)}; a hosted app must be staging or production.`
    )
  }
  return pass(name, `ok, environment ${environment}, version ${String(body.version ?? "unknown")}.`)
}

export function checkSecurityHeaders(probe: Probe, path: string): CheckResult {
  const name = `Security headers (${path})`
  const problems: string[] = []
  for (const [header, valid, expected] of EXPECTED_HEADERS) {
    const value = probe.headers.get(header)
    if (!value || !valid(value)) problems.push(`${header} should be ${expected}`)
  }
  if (probe.headers.has("x-powered-by")) problems.push("x-powered-by should be absent")
  return problems.length === 0
    ? pass(
        name,
        "nosniff, strict referrer policy, DENY framing, permissions policy; no X-Powered-By."
      )
    : fail(name, `${problems.join("; ")}.`)
}

export function checkHsts(probe: Probe): CheckResult {
  const name = "Strict-Transport-Security"
  const value = probe.headers.get("strict-transport-security")
  return value && /max-age=\d+/.test(value)
    ? pass(name, value)
    : warn(
        name,
        "Not sent. Vercel adds it on its domains; check the host or proxy in front of the app."
      )
}

/** Supabase session cookies are `sb-<ref>-auth-token` (possibly chunked `.0`, `.1`). */
const setsSessionCookie = (setCookies: readonly string[]) =>
  setCookies.some((cookie) => {
    const [pair = ""] = cookie.split(";")
    const [cookieName = "", value = ""] = pair.split("=")
    return /^sb-.+-auth-token(\.\d+)?$/.test(cookieName.trim()) && value.trim() !== ""
  })

export function checkCallbackRejectsBadLink(probe: Probe, appUrl: string): CheckResult {
  const name = "Auth callback rejects a bad link"
  if (probe.status < 300 || probe.status >= 400) {
    return fail(name, `Expected a redirect, got HTTP ${probe.status}.`)
  }
  const location = probe.headers.get("location")
  if (!location) return fail(name, "Redirect without a Location header.")
  const target = new URL(location, appUrl)
  if (target.origin !== new URL(appUrl).origin) {
    return fail(name, `Redirects off-site to ${target.host}.`)
  }
  if (target.pathname !== "/login" || target.searchParams.get("error") !== "auth_callback_failed") {
    return fail(name, `Redirects to ${target.pathname}${target.search}, expected the login error.`)
  }
  if (setsSessionCookie(probe.setCookies)) return fail(name, "It set a session cookie.")
  return pass(name, "Redirects to /login?error=auth_callback_failed without a session.")
}

export function checkInvitationPage(probe: Probe): CheckResult {
  const name = "Invitation page is private"
  if (probe.status !== 200) return fail(name, `/invite/<random> answered HTTP ${probe.status}.`)
  const cacheControl = probe.headers.get("cache-control") ?? ""
  if (!cacheControl.includes("no-store")) {
    return fail(name, `Cache-Control is "${cacheControl}", expected no-store.`)
  }
  if (!/<meta[^>]+name="robots"[^>]+noindex/.test(probe.body)) {
    return fail(name, "The page doesn't ask search engines not to index it.")
  }
  return pass(name, "Uncached (no-store) and noindex.")
}

async function probe(url: string, init: RequestInit = {}): Promise<Probe> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) })
  return {
    status: response.status,
    headers: response.headers,
    body: await response.text(),
    setCookies: response.headers.getSetCookie(),
  }
}

async function fetchJson(url: string, apiKey: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { apikey: apiKey },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`${new URL(url).pathname} answered HTTP ${response.status}`)
  return response.json()
}

export async function main(
  env: Env = process.env,
  argv: readonly string[] = process.argv.slice(2)
): Promise<number> {
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "")
  const apiKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  const appUrl = env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "")
  const authOnly = argv.includes("--auth-only")
  const expectedEnv = env.VERIFY_EXPECT_APP_ENV || undefined

  if (!supabaseUrl || !apiKey) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.")
    return 1
  }
  if (!authOnly && !appUrl) {
    console.error("Set NEXT_PUBLIC_APP_URL, or pass --auth-only to check Supabase alone.")
    return 1
  }
  if (expectedEnv && expectedEnv !== "staging" && expectedEnv !== "production") {
    console.error("VERIFY_EXPECT_APP_ENV must be staging or production.")
    return 1
  }

  const results: CheckResult[] = []
  const run = async (name: string, check: () => CheckResult | Promise<CheckResult>) => {
    try {
      results.push(await check())
    } catch (error) {
      results.push(fail(name, `Couldn't check: ${(error as Error).message}`))
    }
  }

  console.log(`Supabase: ${new URL(supabaseUrl).host}`)
  await run("Supabase URL", () => checkHostedUrl("Supabase URL", supabaseUrl))
  let settings: unknown
  await run("Auth settings", async () => {
    settings = await fetchJson(`${supabaseUrl}/auth/v1/settings`, apiKey)
    return checkAuthSettings(settings)
  })
  if (settings !== undefined) await run("Email sign-up enabled", () => checkEmailSignup(settings))
  await run("Asymmetric JWT signing key", async () =>
    checkSigningKeys(await fetchJson(`${supabaseUrl}/auth/v1/.well-known/jwks.json`, apiKey))
  )

  if (authOnly || !appUrl) {
    console.log("App: SKIPPED (--auth-only). Run without it to check the deployment too.")
  } else {
    console.log(`App: ${new URL(appUrl).host}`)
    await run("App URL", () => checkHostedUrl("App URL", appUrl))
    await run("Health endpoint", async () =>
      checkHealth(await probe(`${appUrl}/api/health`), expectedEnv)
    )
    await run("Security headers", async () => {
      const landing = await probe(`${appUrl}/`)
      results.push(checkHsts(landing))
      return checkSecurityHeaders(landing, "/")
    })
    await run("Auth callback rejects a bad link", async () => {
      const bogus = new URLSearchParams({
        token_hash: randomBytes(28).toString("hex"),
        type: "email",
        next: "/dashboard",
      })
      return checkCallbackRejectsBadLink(
        await probe(`${appUrl}/auth/callback?${bogus}`, { redirect: "manual" }),
        appUrl
      )
    })
    await run("Invitation page is private", async () =>
      checkInvitationPage(await probe(`${appUrl}/invite/${randomBytes(32).toString("base64url")}`))
    )
  }

  const label: Record<CheckStatus, string> = { pass: "PASS", fail: "FAIL", warn: "WARN" }
  for (const result of results) {
    console.log(`${label[result.status]}  ${result.name}: ${result.detail}`)
  }
  const failures = results.filter((result) => result.status === "fail").length
  console.log(
    failures === 0
      ? `All ${results.length} checks passed${results.some((r) => r.status === "warn") ? " (with warnings)" : ""}.`
      : `${failures} of ${results.length} checks failed.`
  )
  return failures === 0 ? 0 : 1
}

// Run only when executed directly (tests import the checks).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main()
}
