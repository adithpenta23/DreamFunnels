import { z } from "zod"
import { WORKSPACE_SLUG_PATTERN, isReservedWorkspaceSlug } from "./lib/slug"

/**
 * Workspace input validation, mirrored by the database constraints (see
 * ./lib/slug.ts). Field names match the form inputs, so validation errors land
 * on the right field.
 */

export const workspaceNameSchema = z
  .string({ error: "Enter a workspace name." })
  .trim()
  .min(1, { error: "Enter a workspace name." })
  .max(80, { error: "Use 80 characters or fewer." })

/** A slug typed by a user: trimmed and lowercased before it's checked. */
export const workspaceSlugSchema = z
  .string({ error: "Enter a workspace URL." })
  .trim()
  .toLowerCase()
  .min(1, { error: "Enter a workspace URL." })
  .regex(WORKSPACE_SLUG_PATTERN, {
    error:
      "Use 3–48 lowercase letters, numbers or hyphens, starting and ending with a letter or number.",
  })
  .refine((slug) => !isReservedWorkspaceSlug(slug), {
    error: "That URL is reserved. Please choose another.",
  })

/** Blank means "generate one from the name" (done by the database). */
export const optionalWorkspaceSlugSchema = z.preprocess(
  (value) =>
    value === null || (typeof value === "string" && value.trim() === "") ? undefined : value,
  workspaceSlugSchema.optional()
)

export const createWorkspaceSchema = z.object({
  workspaceName: workspaceNameSchema,
  workspaceSlug: optionalWorkspaceSlugSchema,
})

export const updateWorkspaceSchema = z.object({
  // Identifies the workspace only; access is re-checked on the server.
  workspaceId: z.uuid({ error: "Unknown workspace." }),
  workspaceName: workspaceNameSchema,
  workspaceSlug: workspaceSlugSchema,
})

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>
