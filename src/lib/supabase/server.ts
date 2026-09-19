import "server-only"

import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { publicEnv } from "@/lib/env/public"
import type { Database } from "@/types/database.types"
import { withPostgrestClockRetry } from "./postgrest-retry"

const postgrestFetch = withPostgrestClockRetry()

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 *
 * Acts as the signed-in user (publishable key + session cookie), so every
 * query is subject to RLS. Create one per request — never cache or share it.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      // Survives PostgREST's "JWT issued at future" right after sign-in (see postgrest-retry.ts).
      global: { fetch: postgrestFetch },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Server Components can't write cookies. Safe to ignore: the proxy
            // refreshes the session on every request before rendering.
          }
        },
      },
    }
  )
}

/**
 * A Supabase client that is NOT bound to the request's cookies: whatever
 * session it establishes lives in memory and dies with the object. Use it to
 * check credentials (e.g. "confirm your current password") without replacing
 * the signed-in user's session. RLS applies as usual.
 */
export function createDetachedClient() {
  const jar = new Map<string, string>()

  return createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return Array.from(jar, ([name, value]) => ({ name, value }))
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            if (value) jar.set(name, value)
            else jar.delete(name)
          }
        },
      },
    }
  )
}
