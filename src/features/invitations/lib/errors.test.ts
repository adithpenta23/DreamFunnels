import { describe, expect, it } from "vitest"
import { toPublicError } from "@/lib/errors"
import { acceptFailureError, toInvitationWriteError, type AcceptFailure } from "./errors"

describe("toInvitationWriteError", () => {
  it("explains a missing role without leaking the database message", () => {
    const error = toInvitationWriteError({
      code: "42501",
      message: "Not allowed to invite people to this workspace",
    })
    expect(toPublicError(error)).toEqual({
      code: "FORBIDDEN",
      message: "Only workspace owners and admins can manage invitations.",
    })
  })

  it("points constraint violations at the right field", () => {
    expect(
      toInvitationWriteError({
        code: "23514",
        message:
          'new row for relation "workspace_invitations" violates check constraint "workspace_invitations_email_check"',
      }).fieldErrors
    ).toEqual({ email: ["Enter a valid email address."] })
    expect(toInvitationWriteError({ code: "22023", message: "x" }).fieldErrors).toEqual({
      role: ["Choose member or admin."],
    })
  })

  it("treats anything else as unexpected, logging code and constraint only", () => {
    const error = toInvitationWriteError({ code: "XX000", message: "alice@example.com broke it" })
    expect(error.code).toBe("INTERNAL")
    expect(JSON.stringify(error.context)).not.toContain("alice@example.com")
    expect(toPublicError(error).message).not.toContain("alice")
  })
})

describe("acceptFailureError", () => {
  it.each([
    ["invalid", "NOT_FOUND", /isn't valid/],
    ["expired", "CONFLICT", /expired/],
    ["revoked", "CONFLICT", /cancelled/],
    ["already_used", "CONFLICT", /already been used/],
    ["email_mismatch", "FORBIDDEN", /different email address/],
    ["email_unverified", "FORBIDDEN", /Confirm your email/],
  ] as const)("turns %s into a clear, safe message", (outcome, code, message) => {
    const error = acceptFailureError(outcome as AcceptFailure)
    expect(error.code).toBe(code)
    expect(toPublicError(error).message).toMatch(message)
  })
})
