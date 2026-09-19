import { createBrowserClient } from "@supabase/ssr"
import { publicEnv } from "@/lib/env/public"
import type { Database } from "@/types/database.types"

/**
 * Supabase client for Client Components (e.g. realtime subscriptions).
 * Uses the publishable key; all access is enforced by RLS. Prefer Server
 * Components/Actions for data access and anything sensitive.
 */
export function createClient() {
  return createBrowserClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  )
}
