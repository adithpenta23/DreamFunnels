import { z } from "zod"
import { fullNameSchema } from "@/features/account/schemas"
import { optionalWorkspaceSlugSchema, workspaceNameSchema } from "@/features/workspaces/schemas"

/** First-run setup: who you are, and your first workspace. */
export const onboardingSchema = z.object({
  fullName: fullNameSchema,
  workspaceName: workspaceNameSchema,
  workspaceSlug: optionalWorkspaceSlugSchema,
})

export type OnboardingInput = z.infer<typeof onboardingSchema>
