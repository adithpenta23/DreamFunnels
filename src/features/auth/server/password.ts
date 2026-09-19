import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { createDetachedClient } from "@/lib/supabase/server"
import type { Database } from "@/types/database.types"
import { toAuthAppError } from "../lib/auth-errors"

/**
 * Confirms that `password` is the account's current password without
 * touching the caller's session: the check signs in on a detached client and
 * immediately ends that extra session.
 *
 * Supabase Auth rate-limits sign-in attempts, which also limits guessing
 * through this check.
 */
export async function verifyCurrentPassword(email: string, password: string): Promise<void> {
  const client = createDetachedClient()
  const { error } = await client.auth.signInWithPassword({ email, password })

  if (error) {
    if (error.code === "invalid_credentials" || error.message === "Invalid login credentials") {
      throw new AppError("VALIDATION", "Current password did not match", {
        fieldErrors: { currentPassword: ["That isn't your current password."] },
      })
    }
    throw toAuthAppError(error, "sign_in")
  }

  const { error: signOutError } = await client.auth.signOut({ scope: "local" })
  if (signOutError) {
    // Not fatal: the verification session simply expires on its own.
    logger.warn("auth.password_check_sign_out_failed", { code: signOutError.code })
  }
}

/**
 * Ends the user's sessions on every other device after a password change,
 * so a leaked session can't outlive the password it came from.
 */
export async function signOutOtherSessions(supabase: SupabaseClient<Database>): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: "others" })
  if (error) {
    // The password change itself succeeded; don't fail the request over this.
    logger.warn("auth.sign_out_others_failed", { code: error.code, status: error.status })
  }
}
