import { z } from "zod"
import { optionalPhoneSchema } from "@/lib/phone"
import { timezoneSchema } from "@/lib/timezones"
import { isSupportedLocale } from "./lib/locales"

/** Mirrors the CHECK on public.profiles.full_name (at most 120 characters). */
export const fullNameSchema = z
  .string({ error: "Enter your name." })
  .trim()
  .min(1, { error: "Enter your name." })
  .max(120, { error: "Use 120 characters or fewer." })

export const localeSchema = z
  .string({ error: "Choose a format." })
  .refine(isSupportedLocale, { error: "Choose a format from the list." })

export const updateProfileSchema = z.object({
  fullName: fullNameSchema,
  phone: optionalPhoneSchema,
  timezone: timezoneSchema,
  locale: localeSchema,
})

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>
