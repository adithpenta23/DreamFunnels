import "server-only"

import { cache } from "react"
import { requireUser } from "@/features/auth/server/session"
import { AppError } from "@/lib/errors"
import { createClient } from "@/lib/supabase/server"

/** The signed-in user's app-facing profile. */
export type Profile = {
  id: string
  email: string | null
  fullName: string | null
}

export const getCurrentProfile = cache(async (): Promise<Profile> => {
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("profiles")
    .select("email, full_name")
    .eq("id", user.id)
    .maybeSingle()

  if (error) {
    throw new AppError("INTERNAL", "Failed to load profile", {
      cause: error,
      context: { code: error.code },
    })
  }
  // The signup trigger always creates the row; fall back to the session just in case.
  return { id: user.id, email: data?.email ?? user.email, fullName: data?.full_name ?? null }
})

/** Updates the caller's display name (RLS: users may only update themselves). */
export async function updateProfileName(userId: string, fullName: string): Promise<void> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", userId)
    .select("id")
    .maybeSingle()

  if (error || !data) {
    throw new AppError("INTERNAL", "Failed to update profile", {
      cause: error,
      context: { code: error?.code, found: Boolean(data) },
    })
  }
}
