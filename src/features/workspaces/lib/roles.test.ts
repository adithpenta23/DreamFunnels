import { describe, expect, it } from "vitest"
import { WORKSPACE_ROLES, hasWorkspaceRole } from "./roles"

describe("hasWorkspaceRole", () => {
  it("orders roles from least to most privileged, matching the database enum", () => {
    expect(WORKSPACE_ROLES).toEqual(["member", "admin", "owner"])
  })

  it.each([
    ["owner", "admin", true],
    ["owner", "owner", true],
    ["admin", "member", true],
    ["admin", "owner", false],
    ["member", "admin", false],
    ["member", "member", true],
  ] as const)("%s satisfies %s: %s", (actual, required, expected) => {
    expect(hasWorkspaceRole(actual, required)).toBe(expected)
  })
})
