import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database.types"
import type { RateLimitStore } from "./core"

/**
 * Counters in Postgres (private.rate_limit_counters via the service-role-only
 * public.rate_limit_hit RPC): shared by every server instance, with no extra
 * infrastructure. It needs the admin client because the RPC must not be
 * callable with the public key — this is a no-user path (it runs before
 * sign-in), and the function touches nothing but the counters table.
 */
export function createPostgresStore(client: SupabaseClient<Database>): RateLimitStore {
  return {
    name: "postgres",
    async hit(key, windowSeconds) {
      const { data, error } = await client.rpc("rate_limit_hit", {
        p_key: key,
        p_window_seconds: windowSeconds,
      })
      if (error) throw new Error(`rate_limit_hit failed (${error.code})`)
      const row = data[0]
      if (!row) throw new Error("rate_limit_hit returned no row")
      return { hits: row.hits, windowEndsAt: new Date(row.window_ends_at) }
    },
  }
}
