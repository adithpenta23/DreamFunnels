import { test } from "@playwright/test"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

/**
 * Access to the Supabase stack the app under test talks to (normally the
 * local one from `npm run db:start`). Values come from .env.local or the
 * environment (CI), loaded in playwright.config.ts.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const secretKey = process.env.SUPABASE_SECRET_KEY

async function isSupabaseReachable(): Promise<boolean> {
  if (!supabaseUrl || !publishableKey) return false
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/health`, {
      headers: { apikey: publishableKey },
      signal: AbortSignal.timeout(3_000),
    })
    return response.ok
  } catch {
    return false
  }
}

/**
 * Call at the top of a spec whose tests need a real Supabase (Auth + REST).
 * Locally the spec is skipped, with instructions, when none is running. CI
 * sets E2E_REQUIRE_SUPABASE=1 so a missing backend fails instead of skipping.
 */
export function requireSupabase() {
  test.beforeAll(async () => {
    const reachable = await isSupabaseReachable()
    if (!reachable && process.env.E2E_REQUIRE_SUPABASE === "1") {
      throw new Error(`E2E_REQUIRE_SUPABASE=1 but Supabase isn't reachable at ${supabaseUrl}`)
    }
    test.skip(
      !reachable,
      `Supabase isn't reachable at ${supabaseUrl}. Start it with \`npm run db:start\` (needs Docker).`
    )
  })
}

let admin: SupabaseClient | null | undefined

/**
 * A service-role client for things a test can't do through the UI (reading
 * an emailed link, cleaning up). Null when no secret key is configured.
 */
export function adminClient(): SupabaseClient | null {
  if (admin === undefined) {
    admin =
      supabaseUrl && secretKey
        ? createClient(supabaseUrl, secretKey, {
            auth: { persistSession: false, autoRefreshToken: false },
          })
        : null
  }
  return admin
}

/**
 * The app URL a password-reset email would link to, without sending one.
 * Uses the token_hash form, like supabase/templates/recovery.html.
 */
export async function passwordResetLink(email: string): Promise<string> {
  const client = adminClient()
  if (!client) throw new Error("SUPABASE_SECRET_KEY is required to generate reset links")
  const { data, error } = await client.auth.admin.generateLink({ type: "recovery", email })
  if (error) throw error
  const params = new URLSearchParams({
    token_hash: data.properties.hashed_token,
    type: "recovery",
    next: "/reset-password",
  })
  return `/auth/callback?${params.toString()}`
}

/** Deletes test users by email (best effort; local databases are disposable). */
export async function deleteUsers(emails: readonly string[]): Promise<void> {
  const client = adminClient()
  if (!client || emails.length === 0) return
  const { data } = await client.auth.admin.listUsers({ perPage: 1000 })
  const wanted = new Set(emails)
  for (const user of data?.users ?? []) {
    if (user.email && wanted.has(user.email)) await client.auth.admin.deleteUser(user.id)
  }
}
