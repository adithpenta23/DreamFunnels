"use server"

import { refresh } from "next/cache"
import { requireUser } from "@/features/auth/server/session"
import { validationFailed, type ActionResult } from "@/lib/action-result"
import { logger } from "@/lib/logger"
import { runAction } from "@/lib/run-action"
import { updateProfileSchema } from "./schemas"
import { updateProfileName } from "./server/profile"

export type UpdateProfileState = ActionResult<{ fullName: string }> | null

export async function updateProfile(
  _previous: UpdateProfileState,
  formData: FormData
): Promise<UpdateProfileState> {
  const parsed = updateProfileSchema.safeParse({ fullName: formData.get("fullName") ?? undefined })
  if (!parsed.success) return validationFailed(parsed.error)

  return runAction("account.updateProfile", async () => {
    const user = await requireUser()
    await updateProfileName(user.id, parsed.data.fullName)
    logger.info("account.profile_updated")
    // The name also appears in the shell (user menu, dashboard greeting).
    refresh()
    return { fullName: parsed.data.fullName }
  })
}
