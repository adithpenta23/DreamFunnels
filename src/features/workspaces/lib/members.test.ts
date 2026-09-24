import { describe, expect, it } from "vitest"
import { isAppError, toPublicError } from "@/lib/errors"
import {
  isLastOwnerViolation,
  ownershipRefusalError,
  toLeaveError,
  toMemberWriteError,
  toOwnershipWriteError,
} from "./member-errors"
import {
  canManageClients,
  canManageMembers,
  clientsHomeSlug,
  leavePolicy,
  memberActionsFor,
  ownershipActionsFor,
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

describe("ownershipActionsFor", () => {
  const viewer = (role: WorkspaceRole, directRole: WorkspaceRole | null = role) => ({
    userId: "viewer",
    role,
    directRole,
  })

  it("lets a direct owner transfer to non-owners, in agencies and clients", () => {
    for (const role of ["member", "admin"] as const) {
      expect(ownershipActionsFor(viewer("owner"), them(role), "agency")).toEqual({
        canTransferOwnership: true,
        canMakeOwner: false,
      })
      expect(ownershipActionsFor(viewer("owner"), them(role), "client")).toEqual({
        canTransferOwnership: true,
        canMakeOwner: true,
      })
    }
  })

  it("gives an inherited (agency) owner make-owner in clients, but nothing to transfer", () => {
    expect(ownershipActionsFor(viewer("owner", null), them("member"), "client")).toEqual({
      canTransferOwnership: false,
      canMakeOwner: true,
    })
    // An agency admin who's also a client owner-by-inheritance doesn't exist; an
    // agency owner with a lower direct role still can't transfer.
    expect(ownershipActionsFor(viewer("owner", "admin"), them("member"), "client")).toEqual({
      canTransferOwnership: false,
      canMakeOwner: true,
    })
  })

  it("gives admins and members nothing, anywhere", () => {
    for (const role of ["member", "admin"] as const) {
      for (const type of ["agency", "client"] as const) {
        expect(ownershipActionsFor(viewer(role), them("member"), type)).toEqual({
          canTransferOwnership: false,
          canMakeOwner: false,
        })
      }
    }
  })

  it("never targets yourself or an existing owner", () => {
    expect(
      ownershipActionsFor(viewer("owner"), { userId: "viewer", role: "owner" }, "client")
    ).toEqual({ canTransferOwnership: false, canMakeOwner: false })
    expect(ownershipActionsFor(viewer("owner"), them("owner"), "client")).toEqual({
      canTransferOwnership: false,
      canMakeOwner: false,
    })
  })
})

describe("leavePolicy", () => {
  const base = {
    workspaceName: "ABC Roofing",
    workspaceType: "agency" as const,
    directRole: "member" as WorkspaceRole | null,
    directOwnerCount: 1,
    agency: null as { name: string; role: WorkspaceRole } | null,
  }

  it("lets members and admins leave, and says they lose access", () => {
    for (const directRole of ["member", "admin"] as const) {
      const policy = leavePolicy({ ...base, directRole })
      expect(policy).toEqual({ canLeave: true, impact: "You'll lose access to this workspace." })
    }
  })

  it("lets an owner leave when another direct owner remains", () => {
    const policy = leavePolicy({ ...base, directRole: "owner", directOwnerCount: 2 })
    expect(policy.canLeave).toBe(true)
    expect(policy.canLeave && policy.impact).toMatch(/other owners keep managing it/)
  })

  it("refuses an agency's last owner and suggests transferring first", () => {
    const policy = leavePolicy({ ...base, directRole: "owner", directOwnerCount: 1 })
    expect(policy).toMatchObject({ canLeave: false, reason: "last_owner" })
    expect(!policy.canLeave && policy.explanation).toMatch(/Transfer ownership/)
  })

  it("lets a client's last direct owner leave: the agency's owners keep it", () => {
    const policy = leavePolicy({
      ...base,
      workspaceType: "client",
      directRole: "owner",
      directOwnerCount: 1,
      agency: null,
    })
    expect(policy.canLeave).toBe(true)
    expect(policy.canLeave && policy.impact).toMatch(/agency that manages it will keep ownership/)
    const named = leavePolicy({
      ...base,
      workspaceType: "client",
      directRole: "owner",
      agency: { name: "Acme Agency", role: "member" },
    })
    expect(named.canLeave && named.impact).toMatch(/owners of Acme Agency will keep ownership/)
  })

  it("says so when access continues through the agency", () => {
    const policy = leavePolicy({
      ...base,
      workspaceType: "client",
      directRole: "member",
      agency: { name: "Acme Agency", role: "admin" },
    })
    expect(policy.canLeave && policy.impact).toMatch(/still reach it as an admin of Acme Agency/)
  })

  it("has nothing to leave without a direct membership", () => {
    const policy = leavePolicy({
      ...base,
      workspaceType: "client",
      directRole: null,
      agency: { name: "Acme Agency", role: "owner" },
    })
    expect(policy).toMatchObject({ canLeave: false, reason: "no_direct_membership" })
    expect(!policy.canLeave && policy.explanation).toMatch(/through Acme Agency/)
  })
})

describe("ownership and leave errors", () => {
  it("explains an agency's last owner trying to leave", () => {
    const error = toLeaveError({
      code: "P0001",
      message: "A workspace must have at least one owner",
    })
    expect(toPublicError(error).message).toMatch(/only owner of this workspace. Transfer ownership/)
  })

  it("words each ownership refusal", () => {
    expect(ownershipRefusalError("not_member").code).toBe("NOT_FOUND")
    expect(toPublicError(ownershipRefusalError("already_owner")).message).toMatch(
      /already an owner/
    )
    expect(toPublicError(ownershipRefusalError("self")).message).toMatch(/your own membership/)
  })

  it("maps the functions' 42501 to who may do it", () => {
    const refused = { code: "42501", message: "Only a direct owner…" }
    expect(toPublicError(toOwnershipWriteError(refused, "transfer")).message).toMatch(
      /direct owner/
    )
    expect(toPublicError(toOwnershipWriteError(refused, "make_owner")).message).toMatch(
      /client workspace/
    )
    const unknown = toOwnershipWriteError({ code: "XX000", message: "boom" }, "transfer")
    expect(unknown.code).toBe("INTERNAL")
    expect(toPublicError(unknown).message).not.toContain("boom")
  })
})
