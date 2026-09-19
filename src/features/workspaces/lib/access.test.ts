import { describe, expect, it } from "vitest"
import { authorizeWorkspaceAccess, canManageWorkspace, pickDefaultWorkspace } from "./access"

describe("authorizeWorkspaceAccess", () => {
  it("answers 'not found' to non-members, never revealing that the workspace exists", () => {
    expect(authorizeWorkspaceAccess(null, "member")).toEqual({ ok: false, reason: "not_found" })
    expect(authorizeWorkspaceAccess(null, "owner")).toEqual({ ok: false, reason: "not_found" })
  })

  it.each([
    ["member", "member", true],
    ["member", "admin", false],
    ["admin", "admin", true],
    ["admin", "owner", false],
    ["owner", "admin", true],
    ["owner", "owner", true],
  ] as const)("a %s requesting %s access: allowed=%s", (role, required, allowed) => {
    expect(authorizeWorkspaceAccess({ role }, required)).toEqual(
      allowed ? { ok: true } : { ok: false, reason: "forbidden" }
    )
  })
})

describe("canManageWorkspace", () => {
  it("lets owners and admins, but not members, change workspace settings", () => {
    expect(canManageWorkspace("owner")).toBe(true)
    expect(canManageWorkspace("admin")).toBe(true)
    expect(canManageWorkspace("member")).toBe(false)
  })
})

describe("pickDefaultWorkspace", () => {
  const workspaces = [{ slug: "first" }, { slug: "second" }, { slug: "third" }]

  it("reopens the preferred workspace", () => {
    expect(pickDefaultWorkspace(workspaces, "second")).toEqual({ slug: "second" })
  })

  it("falls back to the oldest workspace when there is no preference", () => {
    expect(pickDefaultWorkspace(workspaces, null)).toEqual({ slug: "first" })
  })

  it("ignores a preference for a workspace the user no longer belongs to", () => {
    expect(pickDefaultWorkspace(workspaces, "someone-elses")).toEqual({ slug: "first" })
  })

  it("returns null when the user has no workspace yet (onboarding)", () => {
    expect(pickDefaultWorkspace([], "anything")).toBeNull()
  })
})
