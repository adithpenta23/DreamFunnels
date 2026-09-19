import { describe, expect, it } from "vitest"
import { z } from "zod"
import { fail, ok, validationFailed } from "./action-result"
import { AppError, isAppError, toPublicError } from "./errors"

describe("AppError", () => {
  it("carries a code, HTTP status and cause", () => {
    const cause = new Error("db down")
    const error = new AppError("NOT_FOUND", "Workspace missing", { cause })
    expect(error).toBeInstanceOf(Error)
    expect(isAppError(error)).toBe(true)
    expect(error).toMatchObject({ code: "NOT_FOUND", status: 404, expose: false })
    expect(error.cause).toBe(cause)
  })
})

describe("toPublicError", () => {
  it("hides internal messages by default", () => {
    const error = new AppError("FORBIDDEN", "user 123 lacks role owner on ws 456")
    expect(toPublicError(error)).toEqual({
      code: "FORBIDDEN",
      message: "You don't have permission to do that.",
    })
  })

  it("passes through messages explicitly marked as safe", () => {
    const error = new AppError("RATE_LIMITED", "Slow down for a minute.", { expose: true })
    expect(toPublicError(error)).toEqual({
      code: "RATE_LIMITED",
      message: "Slow down for a minute.",
    })
  })

  it("treats unknown throwables as generic internal errors", () => {
    for (const thrown of [new Error("SELECT * FROM secrets"), "a string", null]) {
      expect(toPublicError(thrown)).toEqual({
        code: "INTERNAL",
        message: "Something went wrong on our side. Please try again.",
      })
    }
  })
})

describe("action results", () => {
  it("wraps success values", () => {
    expect(ok({ id: 1 })).toEqual({ ok: true, data: { id: 1 } })
  })

  it("uses the default public message when none is given", () => {
    expect(fail("CONFLICT")).toEqual({
      ok: false,
      error: {
        code: "CONFLICT",
        message: "That conflicts with existing data. Please refresh and try again.",
      },
    })
  })

  it("maps Zod issues to per-field errors", () => {
    const schema = z.object({ email: z.email({ error: "Bad email" }), name: z.string().min(1) })
    const result = schema.safeParse({ email: "nope", name: "" })
    if (result.success) throw new Error("expected validation to fail")

    const failure = validationFailed(result.error)
    expect(failure.error.code).toBe("VALIDATION")
    expect(failure.error.fieldErrors?.email).toEqual(["Bad email"])
    expect(failure.error.fieldErrors?.name).toHaveLength(1)
  })
})
