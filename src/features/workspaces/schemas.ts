import { z } from "zod"
import { isCountryCode } from "@/lib/countries"
import { optionalPhoneSchema } from "@/lib/phone"
import { timezoneSchema } from "@/lib/timezones"
import { ASSIGNABLE_MEMBER_ROLES } from "./lib/members"
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

// --- Business profile ----------------------------------------------------------
// Mirrors the CHECKs on public.workspaces. Every optional field turns blank
// into null ("not provided"); the database never stores empty strings.

/** Blank (or missing) -> null; otherwise trimmed and at most `max` characters. */
const optionalText = (max: number) =>
  z
    .string()
    .nullish()
    .transform((value) => value?.trim() ?? "")
    .pipe(z.string().max(max, { error: `Use ${max} characters or fewer.` }))
    .transform((value) => (value === "" ? null : value))

/**
 * Blank -> null; otherwise must pass `schema` (applied to the trimmed value).
 * Parsed explicitly rather than with z.union, which can reduce the inner
 * schema's message to a generic "Invalid input".
 */
const optional = <T extends z.ZodType<unknown, string>>(schema: T) =>
  z
    .string()
    .nullish()
    .transform((value, ctx): z.output<T> | null => {
      const trimmed = value?.trim() ?? ""
      if (trimmed === "") return null
      const result = schema.safeParse(trimmed)
      if (result.success) return result.data
      for (const issue of result.error.issues) {
        ctx.addIssue({ code: "custom", message: issue.message })
      }
      return z.NEVER
    })

const hexColor = z
  .string()
  .regex(/^#?[0-9a-fA-F]{6}$/, { error: "Use a hex color like #1D4ED8." })
  .transform((value) => `#${value.replace(/^#/, "").toLowerCase()}`)

/** A site address; "abcroofing.com" is read as https://abcroofing.com. */
const websiteUrl = z
  .string()
  .transform((value) => (/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`))
  .pipe(
    z
      .url({
        protocol: /^https?$/,
        error: "Enter a website address like https://yourbusiness.com.",
      })
      .max(2048, { error: "That link is too long." })
      .regex(/^\S+$/, { error: "A link can't contain spaces." })
  )

const optionalEmail = optional(
  z
    .string()
    .max(254, { error: "That email address is too long." })
    .toLowerCase()
    .pipe(z.email({ error: "Enter a valid email address." }))
)

/** How customers reach the business. Shared by the profile form and "Add client". */
const businessContactFields = {
  timezone: timezoneSchema,
  businessName: optionalText(120),
  businessEmail: optionalEmail,
  businessPhone: optionalPhoneSchema,
  websiteUrl: optional(websiteUrl),
  addressLine1: optionalText(200),
  addressLine2: optionalText(200),
  addressCity: optionalText(100),
  addressRegion: optionalText(100),
  addressPostalCode: optionalText(20),
  addressCountry: optional(
    z.string().toUpperCase().refine(isCountryCode, { error: "Choose a country from the list." })
  ),
}

export const updateWorkspaceProfileSchema = z.object({
  // Identifies the workspace only; access is re-checked on the server.
  workspaceId: z.uuid({ error: "Unknown workspace." }),
  ...businessContactFields,
  logoUrl: optional(
    z
      .url({ protocol: /^https$/, error: "Enter a full https:// link to an image." })
      .max(2048, { error: "That link is too long." })
      .regex(/^\S+$/, { error: "A link can't contain spaces." })
  ),
  brandPrimaryColor: optional(hexColor),
  brandSecondaryColor: optional(hexColor),
})

export type UpdateWorkspaceProfileInput = z.infer<typeof updateWorkspaceProfileSchema>

// --- Clients and members ---------------------------------------------------------

/**
 * "Add client": the business, its workspace, and optionally who to invite.
 * The workspace name defaults to the business name (cut to 80 characters).
 * The agency id is a reference only: the database checks the caller runs it.
 */
export const createClientSchema = z
  .object({
    agencyId: z.uuid({ error: "Unknown workspace." }),
    ...businessContactFields,
    businessName: z
      .string({ error: "Enter the business name." })
      .trim()
      .min(1, { error: "Enter the business name." })
      .max(120, { error: "Use 120 characters or fewer." }),
    workspaceName: z.preprocess(
      (value) =>
        value === null || (typeof value === "string" && value.trim() === "") ? undefined : value,
      workspaceNameSchema.optional()
    ),
    workspaceSlug: optionalWorkspaceSlugSchema,
    /** Optional: invite the client's owner or contact in the same step. */
    ownerEmail: optionalEmail,
    ownerRole: z.enum(ASSIGNABLE_MEMBER_ROLES, { error: "Choose a role." }).default("admin"),
  })
  .transform(({ workspaceName, ...client }) => ({
    ...client,
    workspaceName: workspaceName ?? client.businessName.slice(0, 80).trim(),
  }))

export type CreateClientInput = z.infer<typeof createClientSchema>

/** Which member of which workspace; both are re-checked on the server. */
export const memberRefSchema = z.object({
  workspaceId: z.uuid({ error: "Unknown workspace." }),
  userId: z.uuid({ error: "Unknown member." }),
})

export const changeMemberRoleSchema = memberRefSchema.extend({
  role: z.enum(ASSIGNABLE_MEMBER_ROLES, { error: "Choose member or admin." }),
})

/** The Clients page URL state: `?q=` search and `?page=`. Bad values fall back. */
export const clientListParamsSchema = z.object({
  q: z
    .string()
    .trim()
    .max(80)
    .optional()
    .catch(undefined)
    .transform((value) => value || undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
})
