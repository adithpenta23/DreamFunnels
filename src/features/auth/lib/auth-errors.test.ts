import { describe, expect, it } from "vitest"
import { toPublicError } from "@/lib/errors"
import { isRateLimited, toAuthAppError, type AuthErrorLike } from "./auth-errors"

const authError = (code: string | undefined, status = 400, message = "provider says no") =>
  ({ code, status, message }) satisfies AuthErrorLike

describe("toAuthAppError", () => {
  it("gives a generic message for bad credentials, without revealing which part was wrong", () => {
    const error = toAuthAppError(authError("invalid_credentials"), "sign_in")
    expect(toPublicError(error)).toEqual({
      code: "UNAUTHENTICATED",
      message: "Incorrect email or password.",
    })
  })

  it("recognises bad credentials from older Auth servers without error codes", () => {
    const error = toAuthAppError(authError(undefined, 400, "Invalid login credentials"), "sign_in")
    expect(error.code).toBe("UNAUTHENTICATED")
  })

  it("points existing accounts at sign-in, on the email field", () => {
    const error = toAuthAppError(authError("user_already_exists", 422), "sign_up")
    expect(error.code).toBe("CONFLICT")
    expect(error.fieldErrors).toEqual({
      email: ["An account with this email already exists. Sign in instead."],
    })
  })

  it.each([
    [
      "weak_password",
      "password",
      "This password is too weak or too common. Choose a different one.",
    ],
    ["same_password", "password", "Choose a password different from your current one."],
    [
      "email_address_invalid",
      "email",
      "We can't send email to this address. Check it and try again.",
    ],
  ])("maps %s to a message on the %s field", (code, field, message) => {
    const error = toAuthAppError(authError(code, 422), "update_password")
    expect(error.fieldErrors).toEqual({ [field]: [message] })
  })

  it("tells unconfirmed users what to do next", () => {
    const error = toAuthAppError(authError("email_not_confirmed"), "sign_in")
    expect(toPublicError(error).message).toMatch(/confirm your email address/i)
  })

  it.each([
    [authError(undefined, 429), "Too many attempts. Please wait a minute and try again."],
    [
      authError("over_request_rate_limit", 429),
      "Too many attempts. Please wait a minute and try again.",
    ],
    [
      authError("over_email_send_rate_limit", 429),
      "We've sent too many emails to this address. Please wait a few minutes and try again.",
    ],
  ])("reports rate limits (%j)", (input, message) => {
    expect(isRateLimited(input)).toBe(true)
    expect(toPublicError(toAuthAppError(input, "request_password_reset"))).toEqual({
      code: "RATE_LIMITED",
      message,
    })
  })

  it("hides unexpected provider errors behind a generic message", () => {
    const error = toAuthAppError(
      authError("unexpected_failure", 500, "db exploded at 10.0.0.3"),
      "sign_up"
    )
    expect(error.code).toBe("INTERNAL")
    expect(toPublicError(error)).toEqual({
      code: "INTERNAL",
      message: "Something went wrong on our side. Please try again.",
    })
  })

  it("logs codes but never the provider message", () => {
    const error = toAuthAppError(authError("weak_password", 422, "echoes user input"), "sign_up")
    expect(error.context).toEqual({ operation: "sign_up", status: 422, code: "weak_password" })
  })
})
