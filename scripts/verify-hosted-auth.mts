/**
 * Checks a hosted Supabase project's Auth configuration from the outside,
 * using only public endpoints and the publishable key:
 *
 *   1. Email confirmation is required (`mailer_autoconfirm` is false), so a
 *      staging or production project can't silently let unconfirmed sign-ups in.
 *   2. JWTs are signed with an asymmetric key (the JWKS lists an EC/RSA/OKP
 *      key), so getClaims() verifies tokens locally and no shared secret can
 *      mint sessions.
 *
 * Usage (values from the target environment, e.g. a GitHub environment or
 * `node --env-file=.env.staging ...`):
 *
 *   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co \
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_... \
 *   npm run verify:hosted
 *
 * Exits 1 when a check fails. Never prints keys or tokens.
 */

import { pathToFileURL } from "node:url"

export type CheckResult = { name: string; ok: boolean; detail: string }

const ASYMMETRIC_KEY_TYPES = new Set(["EC", "RSA", "OKP"])

export function checkAuthSettings(settings: unknown): CheckResult {
  const name = "Email confirmation required"
  if (typeof settings !== "object" || settings === null || !("mailer_autoconfirm" in settings)) {
    return { name, ok: false, detail: "Auth settings didn't include mailer_autoconfirm." }
  }
  return settings.mailer_autoconfirm === false
    ? { name, ok: true, detail: "Confirm email is on." }
    : {
        name,
        ok: false,
        detail:
          'Confirm email is OFF. Dashboard: Authentication -> Sign In / Providers -> Email -> enable "Confirm email".',
      }
}

export function checkSigningKeys(jwks: unknown): CheckResult {
  const name = "Asymmetric JWT signing key"
  const keys =
    typeof jwks === "object" && jwks !== null && "keys" in jwks && Array.isArray(jwks.keys)
      ? (jwks.keys as unknown[])
      : null
  if (!keys) return { name, ok: false, detail: "The JWKS endpoint returned no key list." }

  const types = keys.flatMap((key) =>
    typeof key === "object" && key !== null && "kty" in key && typeof key.kty === "string"
      ? [key.kty]
      : []
  )
  const asymmetric = types.filter((type) => ASYMMETRIC_KEY_TYPES.has(type))
  return asymmetric.length > 0
    ? { name, ok: true, detail: `Published key types: ${[...new Set(types)].join(", ")}.` }
    : {
        name,
        ok: false,
        detail:
          "No asymmetric key is published (legacy HS256 secret only). Dashboard: Project Settings -> JWT Keys -> migrate to JWT signing keys, then rotate to the new key.",
      }
}

async function fetchJson(url: string, apiKey: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { apikey: apiKey },
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`${new URL(url).pathname} answered HTTP ${response.status}`)
  return response.json()
}

export async function main(env: Record<string, string | undefined> = process.env): Promise<number> {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "")
  const apiKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !apiKey) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.")
    return 1
  }

  console.log(`Checking Supabase Auth at ${new URL(url).host}`)
  const results: CheckResult[] = []
  const run = async (name: string, check: () => Promise<CheckResult>) => {
    try {
      results.push(await check())
    } catch (error) {
      results.push({ name, ok: false, detail: `Couldn't check: ${(error as Error).message}` })
    }
  }
  await run("Email confirmation required", async () =>
    checkAuthSettings(await fetchJson(`${url}/auth/v1/settings`, apiKey))
  )
  await run("Asymmetric JWT signing key", async () =>
    checkSigningKeys(await fetchJson(`${url}/auth/v1/.well-known/jwks.json`, apiKey))
  )

  for (const result of results) {
    console.log(`${result.ok ? "PASS" : "FAIL"}  ${result.name}: ${result.detail}`)
  }
  return results.every((result) => result.ok) ? 0 : 1
}

// Run only when executed directly (tests import the checks).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main()
}
