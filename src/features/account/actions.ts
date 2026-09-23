"use server"

import { refresh } from "next/cache"
import { requireUser } from "@/features/auth/server/session"
import { validationFailed, type ActionResult } from "@/lib/action-result"
import { logger } from "@/lib/logger"
import { runAction } from "@/lib/run-action"
import { updateProfileSchema, type UpdateProfileInput } from "./schemas"
import { saveProfile } from "./server/profile"

export type UpdateProfileState = ActionResult<UpdateProfileInput> | null

const field = (formData: FormData, name: string) => formData.get(name) ?? undefined

/** Saves the caller's name and preferences. Returns them as stored (e.g. the phone in E.164). */
export async function updateProfile(
  _previous: UpdateProfileState,
  formData: FormData
): Promise<UpdateProfileState> {
  const parsed = updateProfileSchema.safeParse({
    fullName: field(formData, "fullName"),
    phone: field(formData, "phone"),
    timezone: field(formData, "timezone"),
    locale: field(formData, "locale"),
  })
  if (!parsed.success) return validationFailed(parsed.error)

  return runAction("account.updateProfile", async () => {
    const user = await requireUser()
    await saveProfile(user.id, parsed.data)
    logger.info("account.profile_updated")
    // The name also appears in the shell (user menu, dashboard greeting).
    refresh()
    return parsed.data
  })
}
