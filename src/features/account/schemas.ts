import { z } from "zod"

/** Mirrors the CHECK on public.profiles.full_name (at most 120 characters). */
export const fullNameSchema = z
  .string({ error: "Enter your name." })
  .trim()
  .min(1, { error: "Enter your name." })
  .max(120, { error: "Use 120 characters or fewer." })

export const updateProfileSchema = z.object({
  fullName: fullNameSchema,
})

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>
