import { describe, expect, it } from "vitest"
import { acceptInvitationSchema, inviteMemberSchema } from "./schemas"

const workspaceId = "6f1c1d0e-1a2b-4c3d-8e9f-0a1b2c3d4e5f"
const errorsOf = (result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
  result.error?.issues.map((issue) => issue.path.join(".")) ?? []

describe("inviteMemberSchema", () => {
  it("normalises the address like sign-up does (trimmed, lowercase)", () => {
    const parsed = inviteMemberSchema.parse({
      workspaceId,
      email: "  Alex.Smith@Example.COM ",
      role: "admin",
      message: "",
    })
    expect(parsed).toEqual({
      workspaceId,
      email: "alex.smith@example.com",
      role: "admin",
      message: null,
    })
  })

  it("requires a valid email", () => {
    for (const email of ["", "   ", "not-an-email", "a@b", `${"a".repeat(250)}@x.co`]) {
      expect(
        errorsOf(inviteMemberSchema.safeParse({ workspaceId, email, role: "member" }))
      ).toContain("email")
    }
  })

  it("only allows the member and admin roles (never owner)", () => {
    for (const role of ["owner", "viewer", "", undefined]) {
      expect(
        errorsOf(inviteMemberSchema.safeParse({ workspaceId, email: "a@b.co", role }))
      ).toContain("role")
    }
  })

  it("keeps a short personal message, trimmed; blank means none", () => {
    const parse = (message: string) =>
      inviteMemberSchema.safeParse({ workspaceId, email: "a@b.co", role: "member", message })
    expect(parse("  Welcome!\nSee you soon.  ").data?.message).toBe("Welcome!\nSee you soon.")
    expect(parse("   ").data?.message).toBeNull()
    expect(errorsOf(parse("x".repeat(501)))).toContain("message")
  })

  it("requires a workspace id (a reference; access is checked on the server)", () => {
    expect(
      errorsOf(
        inviteMemberSchema.safeParse({ workspaceId: "acme", email: "a@b.co", role: "member" })
      )
    ).toContain("workspaceId")
  })
})

describe("acceptInvitationSchema", () => {
  const token = "A".repeat(43)

  it("accepts a well-formed token, with an optional name", () => {
    expect(acceptInvitationSchema.parse({ token, fullName: "" })).toEqual({ token })
    expect(acceptInvitationSchema.parse({ token, fullName: "  Ada Lovelace " })).toEqual({
      token,
      fullName: "Ada Lovelace",
    })
  })

  it("rejects malformed tokens before they reach the database", () => {
    for (const bad of ["", "x", "A".repeat(44), `${"A".repeat(42)}!`]) {
      expect(errorsOf(acceptInvitationSchema.safeParse({ token: bad }))).toContain("token")
    }
  })
})
