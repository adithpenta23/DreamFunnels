import { describe, expect, it } from "vitest"
import type { z } from "zod"
import {
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "./schemas"

/** First message per field, the way the forms display them. */
function fieldErrors(result: z.ZodSafeParseResult<unknown>) {
  if (result.success) return {}
  const errors: Record<string, string> = {}
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "(form)"
    errors[key] ??= issue.message
  }
  return errors
}

describe("signUpSchema", () => {
  it("accepts a valid signup and normalises the email", () => {
    const result = signUpSchema.parse({
      email: "  Founder@Example.COM ",
      password: "correct horse",
    })
    expect(result).toEqual({ email: "founder@example.com", password: "correct horse" })
  })

  it.each([
    ["missing email", { password: "long enough" }, { email: "Enter your email address." }],
    [
      "blank email",
      { email: "   ", password: "long enough" },
      { email: "Enter your email address." },
    ],
    [
      "malformed email",
      { email: "not-an-email", password: "long enough" },
      { email: "Enter a valid email address." },
    ],
    [
      "overlong email",
      { email: `${"x".repeat(250)}@example.com`, password: "long enough" },
      { email: "That email address is too long." },
    ],
    ["missing password", { email: "a@example.com" }, { password: "Enter a password." }],
    [
      "short password",
      { email: "a@example.com", password: "short" },
      { password: "Use at least 8 characters." },
    ],
    [
      "whitespace password",
      { email: "a@example.com", password: "        " },
      { password: "A password can't be only spaces." },
    ],
    [
      "password over 72 bytes",
      { email: "a@example.com", password: "x".repeat(73) },
      { password: "Use 72 characters or fewer." },
    ],
  ])("rejects a %s", (_label, input, expected) => {
    expect(fieldErrors(signUpSchema.safeParse(input))).toEqual(expected)
  })

  it("measures the password limit in bytes, as bcrypt does", () => {
    // 20 four-byte emoji: 20 characters to a user, 80 bytes to bcrypt.
    expect(
      signUpSchema.safeParse({ email: "a@example.com", password: "😀".repeat(20) }).success
    ).toBe(false)
    expect(
      signUpSchema.safeParse({ email: "a@example.com", password: "x".repeat(72) }).success
    ).toBe(true)
  })

  it("keeps leading and trailing spaces in passwords", () => {
    const result = signUpSchema.parse({ email: "a@example.com", password: "  spaced out  " })
    expect(result.password).toBe("  spaced out  ")
  })
})

describe("signInSchema", () => {
  it("does not apply the new-password policy to existing passwords", () => {
    const result = signInSchema.safeParse({ email: "a@example.com", password: "short" })
    expect(result.success).toBe(true)
  })

  it("requires both fields", () => {
    expect(fieldErrors(signInSchema.safeParse({ email: "", password: "" }))).toEqual({
      email: "Enter your email address.",
      password: "Enter your password.",
    })
  })

  it("passes the redirect target through untouched (it is sanitised separately)", () => {
    const result = signInSchema.parse({ email: "a@example.com", password: "pw", next: "/w/acme" })
    expect(result.next).toBe("/w/acme")
  })
})

describe("forgotPasswordSchema", () => {
  it("only needs a valid email", () => {
    expect(forgotPasswordSchema.parse({ email: "A@B.co" })).toEqual({ email: "a@b.co" })
    expect(fieldErrors(forgotPasswordSchema.safeParse({ email: "nope" }))).toEqual({
      email: "Enter a valid email address.",
    })
  })
})

describe("resetPasswordSchema", () => {
  it("accepts matching passwords", () => {
    expect(
      resetPasswordSchema.safeParse({ password: "new password", confirmPassword: "new password" })
        .success
    ).toBe(true)
  })

  it("rejects a mismatched confirmation on the confirmation field", () => {
    expect(
      fieldErrors(
        resetPasswordSchema.safeParse({ password: "new password", confirmPassword: "typo" })
      )
    ).toEqual({ confirmPassword: "Passwords don't match." })
  })

  it("applies the password policy", () => {
    expect(
      fieldErrors(resetPasswordSchema.safeParse({ password: "short", confirmPassword: "short" }))
    ).toEqual({ password: "Use at least 8 characters." })
  })
})

describe("changePasswordSchema", () => {
  const valid = {
    currentPassword: "old password",
    password: "new password",
    confirmPassword: "new password",
  }

  it("accepts a valid change", () => {
    expect(changePasswordSchema.safeParse(valid).success).toBe(true)
  })

  it("requires the current password", () => {
    expect(fieldErrors(changePasswordSchema.safeParse({ ...valid, currentPassword: "" }))).toEqual({
      currentPassword: "Enter your current password.",
    })
  })

  it("rejects reusing the current password", () => {
    const reuse = {
      currentPassword: "same password",
      password: "same password",
      confirmPassword: "same password",
    }
    expect(fieldErrors(changePasswordSchema.safeParse(reuse))).toEqual({
      password: "Choose a password different from your current one.",
    })
  })

  it("rejects a mismatched confirmation", () => {
    expect(
      fieldErrors(changePasswordSchema.safeParse({ ...valid, confirmPassword: "nope" }))
    ).toEqual({
      confirmPassword: "Passwords don't match.",
    })
  })
})
