import { describe, expect, it } from "vitest"
import { toWorkspaceWriteError } from "./write-errors"

const unique = (constraint: string) => ({
  code: "23505",
  message: `duplicate key value violates unique constraint "${constraint}"`,
})
const check = (constraint: string) => ({
  code: "23514",
  message: `new row for relation "workspaces" violates check constraint "${constraint}"`,
})

describe("toWorkspaceWriteError", () => {
  it("reports a taken URL on the URL field", () => {
    const error = toWorkspaceWriteError(unique("workspaces_slug_key"))
    expect(error.code).toBe("CONFLICT")
    expect(error.fieldErrors).toEqual({
      workspaceSlug: ["That URL is already taken. Please try another."],
    })
  })

  it.each([
    ["workspaces_slug_not_reserved", "workspaceSlug", /reserved/],
    ["workspaces_slug_check", "workspaceSlug", /3–48 lowercase/],
    ["workspaces_name_check", "workspaceName", /1–80 characters/],
  ])("maps %s to the %s field", (constraint, field, message) => {
    const error = toWorkspaceWriteError(check(constraint))
    expect(error.code).toBe("VALIDATION")
    expect(error.fieldErrors?.[field]?.[0]).toMatch(message)
  })

  it.each([
    ["workspaces_timezone_check", "timezone"],
    ["workspaces_business_phone_check", "businessPhone"],
    ["workspaces_address_country_check", "addressCountry"],
    ["workspaces_logo_url_check", "logoUrl"],
    ["workspaces_brand_secondary_color_check", "brandSecondaryColor"],
  ])("maps the business profile constraint %s to the %s field", (constraint, field) => {
    const error = toWorkspaceWriteError(check(constraint))
    expect(error.code).toBe("VALIDATION")
    expect(error.fieldErrors?.[field]).toHaveLength(1)
  })

  it("treats anything else as an unexpected failure, logging only code and constraint", () => {
    const error = toWorkspaceWriteError({ code: "42501", message: "permission denied" })
    expect(error.code).toBe("INTERNAL")
    expect(error.fieldErrors).toBeUndefined()
    expect(error.context).toEqual({ code: "42501", constraint: undefined })
  })
})
