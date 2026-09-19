import { describe, expect, it } from "vitest"
import { violatedConstraint } from "./db-errors"

describe("violatedConstraint", () => {
  it("reads the constraint from unique violations", () => {
    expect(
      violatedConstraint({
        code: "23505",
        message: 'duplicate key value violates unique constraint "workspaces_slug_key"',
      })
    ).toBe("workspaces_slug_key")
  })

  it("reads the constraint from check violations", () => {
    expect(
      violatedConstraint({
        code: "23514",
        message:
          'new row for relation "workspaces" violates check constraint "workspaces_slug_not_reserved"',
      })
    ).toBe("workspaces_slug_not_reserved")
  })

  it("ignores other errors", () => {
    expect(violatedConstraint({ code: "42501", message: 'permission denied for table "x"' })).toBe(
      undefined
    )
    expect(violatedConstraint({ code: "23505" })).toBeUndefined()
  })
})
