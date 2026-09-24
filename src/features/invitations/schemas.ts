import { z } from "zod"
import { fullNameSchema } from "@/features/account/schemas"
import { emailSchema } from "@/features/auth/schemas"
import { INVITATION_TOKEN_PATTERN } from "./lib/tokens"

/**
 * Invitation input validation, shared by the forms and the Server Actions
 * (the authority). The database repeats every rule.
 */

/** Roles an invitation can grant. Ownership is never handed out by email. */
export const INVITABLE_ROLES = ["member", "admin"] as const
export type InvitableRole = (typeof INVITABLE_ROLES)[number]

export const invitableRoleSchema = z.enum(INVITABLE_ROLES, { error: "Choose a role." })

/** Same normalisation as sign-up (trimmed, lowercase), so the addresses compare equal. */
export const inviteeEmailSchema = emailSchema

export const invitationMessageSchema = z
  .string()
  .nullish()
  .transform((value) => value?.trim() ?? "")
  .pipe(z.string().max(500, { error: "Keep the message to 500 characters or fewer." }))
  .transform((value) => (value === "" ? null : value))

export const inviteMemberSchema = z.object({
  // Identifies the workspace only; access is re-checked on the server.
  workspaceId: z.uuid({ error: "Unknown workspace." }),
  email: inviteeEmailSchema,
  role: invitableRoleSchema,
  message: invitationMessageSchema,
})

export type InviteMemberInput = z.infer<typeof inviteMemberSchema>

/** Resend and revoke: which invitation, in which workspace (both re-checked). */
export const invitationRefSchema = z.object({
  workspaceId: z.uuid(),
  invitationId: z.uuid(),
})

export const invitationTokenSchema = z
  .string({ error: "This invitation link isn't valid." })
  .regex(INVITATION_TOKEN_PATTERN, { error: "This invitation link isn't valid." })

/**
 * Accepting from the onboarding list: the invitation's id (only a reference:
 * the database resolves the workspace and role and checks the verified
 * email) and, for accounts without one, a name.
 */
export const acceptPendingInvitationSchema = z.object({
  invitationId: z.uuid({ error: "Unknown invitation." }),
  fullName: z.preprocess(
    (value) => (value === null || value === "" ? undefined : value),
    fullNameSchema.optional()
  ),
})

export const acceptInvitationSchema = z.object({
  token: invitationTokenSchema,
  /** Asked for when the account has no name yet (new sign-ups skip onboarding). */
  fullName: z.preprocess(
    (value) => (value === null || value === "" ? undefined : value),
    fullNameSchema.optional()
  ),
})
