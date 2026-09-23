"use server"

import { redirect } from "next/navigation"
import { routes } from "@/config/routes"
import { matchLocale } from "@/features/account/lib/locales"
import { saveProfile } from "@/features/account/server/profile"
import { requireUser } from "@/features/auth/server/session"
import { createWorkspace } from "@/features/workspaces/server/mutations"
import { listMyWorkspaces } from "@/features/workspaces/server/queries"
import { validationFailed, type ActionFailure } from "@/lib/action-result"
import { logger } from "@/lib/logger"
import { runAction } from "@/lib/run-action"
import { canonicalTimezone } from "@/lib/timezones"
import { onboardingSchema } from "./schemas"

/** Success redirects into the new workspace, so the form only sees failures. */
export type OnboardingState = ActionFailure | null

const text = (value: FormDataEntryValue | null) => (typeof value === "string" ? value : null)

/**
 * Saves the user's name and creates their first workspace (they become its
 * owner), then opens it. Idempotent: if the user already has a workspace (a
 * second tab, a double submit), it opens that one instead of creating another.
 *
 * The browser's time zone and locale (hidden hints) seed the profile and the
 * workspace; both can be changed in settings. Unusable hints are ignored.
 */
export async function completeOnboarding(
  _previous: OnboardingState,
  formData: FormData
): Promise<OnboardingState> {
  const parsed = onboardingSchema.safeParse({
    fullName: formData.get("fullName") ?? undefined,
    workspaceName: formData.get("workspaceName") ?? undefined,
    workspaceSlug: formData.get("workspaceSlug") ?? undefined,
  })
  if (!parsed.success) return validationFailed(parsed.error)
  const { fullName, workspaceName, workspaceSlug } = parsed.data
  const timezone = canonicalTimezone(text(formData.get("timezone")))
  const locale = matchLocale(text(formData.get("locale")))

  const result = await runAction("onboarding.complete", async () => {
    const user = await requireUser()
    const [existing] = await listMyWorkspaces()
    if (existing) return existing.slug

    await saveProfile(user.id, {
      fullName,
      ...(timezone ? { timezone } : {}),
      ...(locale ? { locale } : {}),
    })
    const workspace = await createWorkspace({
      name: workspaceName,
      slug: workspaceSlug,
      timezone: timezone ?? undefined,
    })
    logger.info("onboarding.completed", { workspaceId: workspace.id })
    return workspace.slug
  })
  if (!result.ok) return result

  redirect(routes.workspace(result.data))
}
