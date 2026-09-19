"use server"

import { redirect } from "next/navigation"
import { routes } from "@/config/routes"
import { updateProfileName } from "@/features/account/server/profile"
import { requireUser } from "@/features/auth/server/session"
import { createWorkspace } from "@/features/workspaces/server/mutations"
import { listMyWorkspaces } from "@/features/workspaces/server/queries"
import { validationFailed, type ActionFailure } from "@/lib/action-result"
import { logger } from "@/lib/logger"
import { runAction } from "@/lib/run-action"
import { onboardingSchema } from "./schemas"

/** Success redirects into the new workspace, so the form only sees failures. */
export type OnboardingState = ActionFailure | null

/**
 * Saves the user's name and creates their first workspace (they become its
 * owner), then opens it. Idempotent: if the user already has a workspace (a
 * second tab, a double submit), it opens that one instead of creating another.
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

  const result = await runAction("onboarding.complete", async () => {
    const user = await requireUser()
    const [existing] = await listMyWorkspaces()
    if (existing) return existing.slug

    await updateProfileName(user.id, fullName)
    const workspace = await createWorkspace({ name: workspaceName, slug: workspaceSlug })
    logger.info("onboarding.completed", { workspaceId: workspace.id })
    return workspace.slug
  })
  if (!result.ok) return result

  redirect(routes.workspace(result.data))
}
