import "server-only"

import { cache } from "react"
import { requireUser } from "@/features/auth/server/session"
import { AppError } from "@/lib/errors"
import { createClient } from "@/lib/supabase/server"
import { DEFAULT_TIMEZONE } from "@/lib/timezones"
import { DEFAULT_LOCALE } from "../lib/locales"

/** The signed-in user's app-facing profile. */
export type Profile = {
  id: string
  email: string | null
  fullName: string | null
  /** E.164, for notifications. */
  phone: string | null
  /** IANA time zone for the user's own notifications. */
  timezone: string
  /** BCP 47 locale for formatting dates and numbers. */
  locale: string
}

export const getCurrentProfile = cache(async (): Promise<Profile> => {
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("profiles")
    .select("email, full_name, phone, timezone, locale")
    .eq("id", user.id)
    .maybeSingle()

  if (error) {
    throw new AppError("INTERNAL", "Failed to load profile", {
      cause: error,
      context: { code: error.code },
    })
  }
  // The signup trigger always creates the row; fall back to the session just in case.
  return {
    id: user.id,
    email: data?.email ?? user.email,
    fullName: data?.full_name ?? null,
    phone: data?.phone ?? null,
    timezone: data?.timezone ?? DEFAULT_TIMEZONE,
    locale: data?.locale ?? DEFAULT_LOCALE,
  }
})

export type ProfileChanges = {
  fullName?: string
  phone?: string | null
  timezone?: string
  locale?: string
}

/** Updates the caller's own profile (RLS: users may only update themselves). */
export async function saveProfile(userId: string, changes: ProfileChanges): Promise<void> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("profiles")
    .update({
      full_name: changes.fullName,
      phone: changes.phone,
      timezone: changes.timezone,
      locale: changes.locale,
    })
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
