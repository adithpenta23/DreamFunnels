import "server-only"

// The only sanctioned direct use of createClient (see eslint.config.mjs).
import { createClient } from "@supabase/supabase-js"
import { publicEnv } from "@/lib/env/public"
import { serverEnv } from "@/lib/env/server"
import { AppError } from "@/lib/errors"
import type { Database } from "@/types/database.types"

/**
 * Privileged Supabase client using the secret key. It BYPASSES Row Level
 * Security, so it must only be used by trusted server code with no user in
 * the loop (webhooks, background jobs, provisioning) — and every query must
 * scope by workspace_id explicitly. Never use it to serve a user request
 * that the user's own session could serve.
 */
export function createAdminClient() {
  const secretKey = serverEnv.SUPABASE_SECRET_KEY
  if (!secretKey) {
    throw new AppError("INTERNAL", "SUPABASE_SECRET_KEY is not configured")
  }

  return createClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}
