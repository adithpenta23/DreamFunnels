import { z } from "zod"

/**
 * Validation for every auth form. Shared by the Server Actions (the
 * authority) and the forms (for hints), so messages are written for users.
 */

export const PASSWORD_MIN_LENGTH = 8
/** Supabase Auth hashes with bcrypt, which only accepts 72 bytes. */
export const PASSWORD_MAX_BYTES = 72

const utf8Length = (value: string) => new TextEncoder().encode(value).length

export const emailSchema = z
  .string({ error: "Enter your email address." })
  .trim()
  .toLowerCase()
  .min(1, { error: "Enter your email address." })
  .max(254, { error: "That email address is too long." })
  .pipe(z.email({ error: "Enter a valid email address." }))

/** A password being checked (sign in, "current password"): no policy, just sane bounds. */
const existingPasswordSchema = (message: string) =>
  z
    .string({ error: message })
    .min(1, { error: message })
    .refine((value) => utf8Length(value) <= PASSWORD_MAX_BYTES, {
      error: "That password is too long.",
    })

/**
 * A password being set. Length-based, per NIST SP 800-63B: no composition
 * rules. Never trimmed: spaces are legitimate password characters.
 */
export const newPasswordSchema = z
  .string({ error: "Enter a password." })
  .min(PASSWORD_MIN_LENGTH, { error: `Use at least ${PASSWORD_MIN_LENGTH} characters.` })
  .refine((value) => utf8Length(value) <= PASSWORD_MAX_BYTES, {
    error: "Use 72 characters or fewer.",
  })
  .refine((value) => value.trim().length > 0, { error: "A password can't be only spaces." })

export const signInSchema = z.object({
  email: emailSchema,
  password: existingPasswordSchema("Enter your password."),
  next: z.string().optional(),
})

export const signUpSchema = z.object({
  email: emailSchema,
  password: newPasswordSchema,
})

export const forgotPasswordSchema = z.object({
  email: emailSchema,
})

const confirmation = z.string({ error: "Confirm your new password." })

export const resetPasswordSchema = z
  .object({
    password: newPasswordSchema,
    confirmPassword: confirmation,
  })
  .refine((input) => input.password === input.confirmPassword, {
    error: "Passwords don't match.",
    path: ["confirmPassword"],
  })

export const changePasswordSchema = z
  .object({
    currentPassword: existingPasswordSchema("Enter your current password."),
    password: newPasswordSchema,
    confirmPassword: confirmation,
  })
  .refine((input) => input.password === input.confirmPassword, {
    error: "Passwords don't match.",
    path: ["confirmPassword"],
  })
  .refine((input) => input.password !== input.currentPassword, {
    error: "Choose a password different from your current one.",
    path: ["password"],
  })

export type SignInInput = z.infer<typeof signInSchema>
export type SignUpInput = z.infer<typeof signUpSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
