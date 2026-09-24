import { describe, expect, it } from "vitest"
import { isAppError, toPublicError } from "@/lib/errors"
import { isLastOwnerViolation, toMemberWriteError } from "./member-errors"
import {
  canManageClients,
  canManageMembers,
  clientsHomeSlug,
  memberActionsFor,
  roleDescription,
} from "./members"
import type { WorkspaceRole } from "./roles"

const me = (role: WorkspaceRole) => ({ userId: "viewer", role })
const them = (role: WorkspaceRole) => ({ userId: "target", role })

describe("memberActionsFor", () => {
  it("lets owners manage everyone else, including other owners", () => {
    for (const role of ["member", "admin", "owner"] as const) {
      expect(memberActionsFor(me("owner"), them(role))).toEqual({
        canChangeRole: true,
        canRemove: true,
      })
    }
  })

  it("lets admins manage members and admins, but never owners", () => {
    expect(memberActionsFor(me("admin"), them("member"))).toEqual({
      canChangeRole: true,
      canRemove: true,
    })
    expect(memberActionsFor(me("admin"), them("admin"))).toEqual({
      canChangeRole: true,
      canRemove: true,
    })
    expect(memberActionsFor(me("admin"), them("owner"))).toEqual({
      canChangeRole: false,
      canRemove: false,
    })
  })

  it("gives plain members no management actions", () => {
    for (const role of ["member", "admin", "owner"] as const) {
      expect(memberActionsFor(me("member"), them(role))).toEqual({
        canChangeRole: false,
        canRemove: false,
      })
    }
  })

  it("never offers actions on your own row, whatever your role", () => {
    for (const role of ["member", "admin", "owner"] as const) {
      expect(memberActionsFor(me(role), { userId: "viewer", role })).toEqual({
        canChangeRole: false,
        canRemove: false,
      })
    }
  })

  it("mirrors the RLS role rule for who manages members", () => {
    expect(canManageMembers("owner")).toBe(true)
    expect(canManageMembers("admin")).toBe(true)
    expect(canManageMembers("member")).toBe(false)
  })
})

describe("canManageClients", () => {
  it("is for agency owners and admins only", () => {
    expect(canManageClients({ type: "agency", role: "owner" })).toBe(true)
    expect(canManageClients({ type: "agency", role: "admin" })).toBe(true)
    expect(canManageClients({ type: "agency", role: "member" })).toBe(false)
    // Clients can't have clients, even for their owners.
    expect(canManageClients({ type: "client", role: "owner" })).toBe(false)
  })
})

describe("clientsHomeSlug", () => {
  const agency = { type: "agency" as const, role: "owner" as const, slug: "acme" }
  const client = { type: "client" as const, role: "owner" as const, slug: "abc-roofing" }

  it("opens the current agency's clients", () => {
    expect(clientsHomeSlug(agency, null, [agency])).toBe("acme")
  })

  it("opens a client's own agency when the viewer can see it", () => {
    expect(clientsHomeSlug(client, { slug: "acme" }, [])).toBe("acme")
  })

  it("falls back to an agency the viewer manages, or nowhere", () => {
    const memberOfAgency = { ...agency, role: "member" as const }
    expect(clientsHomeSlug(client, null, [memberOfAgency, { ...agency, slug: "other" }])).toBe(
      "other"
    )
    expect(clientsHomeSlug(client, null, [memberOfAgency])).toBeNull()
  })
})

describe("roleDescription", () => {
  it("warns that agency admins reach every client", () => {
    expect(roleDescription("admin", "agency")).toMatch(/every client workspace/)
    expect(roleDescription("member", "agency")).toMatch(/No access to client workspaces/)
    expect(roleDescription("admin", "client")).not.toMatch(/client workspace/)
  })
})

describe("toMemberWriteError", () => {
  const lastOwner = {
    code: "P0001",
    message: "A workspace must have at least one owner",
  }

  it("explains the last-owner rule in plain words", () => {
    expect(isLastOwnerViolation(lastOwner)).toBe(true)
    const error = toMemberWriteError(lastOwner)
    expect(error.code).toBe("CONFLICT")
    expect(toPublicError(error).message).toMatch(/needs at least one owner/)
  })

  it("maps an RLS refusal to a permission error", () => {
    const error = toMemberWriteError({
      code: "42501",
      message: 'new row violates row-level security policy for table "workspace_members"',
    })
    expect(error.code).toBe("FORBIDDEN")
    expect(toPublicError(error).message).toMatch(/Only owners/)
  })

  it("keeps other database errors internal", () => {
    const error = toMemberWriteError({ code: "P0001", message: "something else" })
    expect(isAppError(error) && error.code).toBe("INTERNAL")
    expect(toPublicError(error).message).not.toContain("something else")
  })
})
