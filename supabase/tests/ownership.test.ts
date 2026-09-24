import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { fixtures, scalar, type Setup } from "./helpers/fixtures"
import { createTestDb, type TestDb } from "./helpers/test-db"

/**
 * Sprint 4 ownership rules: transfer (direct owners, agencies and clients),
 * make-owner (clients only), the client continuity rule in
 * private.protect_last_owner, leaving, and role escalation. Real concurrency
 * (two transfers at once, transfer vs removal or demotion) runs against the
 * local stack in e2e/ownership-api.spec.ts.
 */

let db: TestDb
let f: ReturnType<typeof fixtures>

beforeAll(async () => {
  db = await createTestDb()
  f = fixtures(db)
})

afterAll(async () => {
  await db.close()
})

const transfer = (userId: string, workspaceId: string, targetId: string) =>
  db.asUser(userId, (tx) =>
    scalar(tx, "public.transfer_workspace_ownership($1, $2)", [workspaceId, targetId])
  )

const makeOwner = (userId: string, workspaceId: string, targetId: string) =>
  db.asUser(userId, (tx) =>
    scalar(tx, "public.make_workspace_owner($1, $2)", [workspaceId, targetId])
  )

const leave = (userId: string, workspaceId: string) =>
  db.asUser(userId, (tx) =>
    tx.query("delete from public.workspace_members where workspace_id = $1 and user_id = $2", [
      workspaceId,
      userId,
    ])
  )

const remove = (userId: string, workspaceId: string, targetId: string) =>
  db.asUser(userId, (tx) =>
    tx.query("delete from public.workspace_members where workspace_id = $1 and user_id = $2", [
      workspaceId,
      targetId,
    ])
  )

const setRole = (userId: string, workspaceId: string, targetId: string, role: string) =>
  db.asUser(userId, (tx) =>
    tx.query(
      "update public.workspace_members set role = $3 where workspace_id = $1 and user_id = $2",
      [workspaceId, targetId, role]
    )
  )

/** Every agency has a direct owner; every client has one, or its agency does. */
async function ownershipIsValid() {
  const { rows } = await db.admin.query<{ id: string }>(`
    select w.id
    from public.workspaces w
    where not exists (
        select 1 from public.workspace_members m where m.workspace_id = w.id and m.role = 'owner'
      )
      and (
        w.workspace_type = 'agency'
        or not exists (
          select 1 from public.workspace_members am
          where am.workspace_id = w.parent_workspace_id and am.role = 'owner'
        )
      )
  `)
  return rows.map((row) => row.id)
}

describe("transferring ownership", () => {
  let t: Setup
  beforeAll(async () => {
    t = await f.setup()
  })

  it("1. a direct agency owner hands it to a direct member: they're owner, the caller admin, atomically", async () => {
    const owner = await db.createUser(f.uniqueEmail("t-owner"), { full_name: "Adith" })
    const sarah = await db.createUser(f.uniqueEmail("t-sarah"), { full_name: "Sarah" })
    const agency = await f.createAgency(owner)
    await f.addMember(agency.id, sarah, "member")

    expect(await transfer(owner, agency.id, sarah)).toBe("transferred")
    expect(await f.rolesIn(agency.id)).toEqual({ [owner]: "admin", [sarah]: "owner" })

    // One ownership event, not two role changes.
    const events = (await f.auditEvents(agency.id)).filter(
      (event) => event.event_type !== "workspace.member_added"
    )
    expect(events).toEqual([
      {
        event_type: "workspace.ownership_transferred",
        actor_user_id: owner,
        target_user_id: sarah,
        metadata: { from: "member", to: "owner", previous_owner_role: "admin" },
      },
    ])
  })

  it("2. works in a client for its direct owner", async () => {
    const extra = await db.createUser(f.uniqueEmail("t-extra"))
    const client = await f.createClient(t.agencyOwner, t.agency.id)
    await f.addMember(client.id, t.clientOwner, "owner")
    await f.addMember(client.id, extra, "admin")

    expect(await transfer(t.clientOwner, client.id, extra)).toBe("transferred")
    expect(await f.rolesIn(client.id)).toEqual({ [t.clientOwner]: "admin", [extra]: "owner" })
  })

  it("3. only a direct owner can: admins, members, outsiders and inherited agency owners get 42501", async () => {
    const callers = [
      [t.clientAdmin, t.clientA.id],
      [t.clientMember, t.clientA.id],
      [t.agencyAdmin, t.agency.id],
      [t.agencyMember, t.agency.id],
      [t.outsider, t.clientA.id],
      [t.otherOwner, t.clientA.id],
      // An agency owner owns the client by inheritance but has no direct row.
      [t.agencyOwner, t.clientA.id],
      [t.agencyAdmin, t.clientA.id],
    ] as const
    for (const [caller, workspaceId] of callers) {
      await expect(transfer(caller, workspaceId, t.clientMember)).rejects.toThrow(
        /direct owner of this workspace/
      )
    }
    await expect(
      db.asAnon((tx) =>
        scalar(tx, "public.transfer_workspace_ownership($1, $2)", [t.clientA.id, t.clientMember])
      )
    ).rejects.toThrow(/permission denied/)
    expect((await f.rolesIn(t.clientA.id))[t.clientOwner]).toBe("owner")
  })

  it("4. the target must be a direct member of that same workspace", async () => {
    const owner = await db.createUser(f.uniqueEmail("t4-owner"))
    const agency = await f.createAgency(owner)
    const client = await f.createClient(owner, agency.id)
    const invitedEmail = f.uniqueEmail("t4-invited")
    const invited = await db.createUser(invitedEmail)
    await f.invite(owner, agency.id, invitedEmail)
    const clientOnly = await db.createUser(f.uniqueEmail("t4-client-only"))
    await f.addMember(client.id, clientOnly, "admin")
    const coOwner = await db.createUser(f.uniqueEmail("t4-co-owner"))
    await f.addMember(agency.id, coOwner, "owner")

    // A pending invitation, a stranger, a sibling tenant's member, someone
    // only in a client of this agency, a random id.
    for (const target of [invited, t.outsider, t.siblingMember, clientOnly, crypto.randomUUID()]) {
      expect(await transfer(owner, agency.id, target)).toBe("not_member")
    }
    expect(await transfer(owner, agency.id, owner)).toBe("self")
    expect(await transfer(owner, agency.id, coOwner)).toBe("already_owner")
    expect(await f.rolesIn(agency.id)).toEqual({ [owner]: "owner", [coOwner]: "owner" })
  })

  it("5. a second transfer by the same (now former) owner is refused", async () => {
    const owner = await db.createUser(f.uniqueEmail("t5-owner"))
    const first = await db.createUser(f.uniqueEmail("t5-first"))
    const second = await db.createUser(f.uniqueEmail("t5-second"))
    const agency = await f.createAgency(owner)
    await f.addMember(agency.id, first, "admin")
    await f.addMember(agency.id, second, "member")

    expect(await transfer(owner, agency.id, first)).toBe("transferred")
    await expect(transfer(owner, agency.id, second)).rejects.toThrow(/direct owner/)
    expect(await f.rolesIn(agency.id)).toEqual({
      [owner]: "admin",
      [first]: "owner",
      [second]: "member",
    })
  })

  it("6. ownership stays valid throughout", async () => {
    expect(await ownershipIsValid()).toEqual([])
  })
})

describe("making someone an owner (clients only)", () => {
  let t: Setup
  beforeAll(async () => {
    t = await f.setup()
  })

  it("1. an agency owner makes a client's member its owner, keeping their own (inherited) role", async () => {
    expect(await makeOwner(t.agencyOwner, t.clientA.id, t.clientMember)).toBe("granted")
    expect((await f.rolesIn(t.clientA.id))[t.clientMember]).toBe("owner")
    // Agency staff are never inserted into client memberships.
    expect((await f.rolesIn(t.clientA.id))[t.agencyOwner]).toBeUndefined()

    const granted = (await f.auditEvents(t.clientA.id)).filter(
      (event) =>
        event.target_user_id === t.clientMember && event.event_type !== "workspace.member_added"
    )
    expect(granted).toEqual([
      {
        event_type: "workspace.owner_granted",
        actor_user_id: t.agencyOwner,
        target_user_id: t.clientMember,
        metadata: { from: "member", to: "owner" },
      },
    ])
  })

  it("2. a client's direct owner can too, without stepping down", async () => {
    expect(await makeOwner(t.clientOwner, t.clientA.id, t.clientAdmin)).toBe("granted")
    const roles = await f.rolesIn(t.clientA.id)
    expect([roles[t.clientOwner], roles[t.clientAdmin]]).toEqual(["owner", "owner"])
  })

  it("3. isn't available in agency workspaces, even to their owners", async () => {
    await expect(makeOwner(t.agencyOwner, t.agency.id, t.agencyAdmin)).rejects.toThrow(
      /client workspace/
    )
    expect((await f.rolesIn(t.agency.id))[t.agencyAdmin]).toBe("admin")
  })

  it("4. admins, members and outsiders can't", async () => {
    const client = await f.createClient(t.agencyOwner, t.agency.id)
    const target = await db.createUser(f.uniqueEmail("m4-target"))
    const clientAdmin = await db.createUser(f.uniqueEmail("m4-admin"))
    await f.addMember(client.id, target, "member")
    await f.addMember(client.id, clientAdmin, "admin")
    for (const caller of [
      t.agencyAdmin,
      clientAdmin,
      target,
      t.agencyMember,
      t.otherOwner,
      t.outsider,
    ]) {
      await expect(makeOwner(caller, client.id, target)).rejects.toThrow(/client workspace/)
    }
    await expect(
      db.asAnon((tx) => scalar(tx, "public.make_workspace_owner($1, $2)", [client.id, target]))
    ).rejects.toThrow(/permission denied/)
    expect((await f.rolesIn(client.id))[target]).toBe("member")
  })

  it("5. the target must be a direct member of that client", async () => {
    const invitedEmail = f.uniqueEmail("m5-invited")
    const invited = await db.createUser(invitedEmail)
    await f.invite(t.agencyOwner, t.clientB.id, invitedEmail)
    for (const target of [invited, t.agencyAdmin, t.agencyMember, t.clientMember, t.outsider]) {
      expect(await makeOwner(t.agencyOwner, t.clientB.id, target)).toBe("not_member")
    }
    expect(await makeOwner(t.agencyOwner, t.clientB.id, t.agencyOwner)).toBe("self")
    await makeOwner(t.agencyOwner, t.clientB.id, t.siblingMember)
    expect(await makeOwner(t.agencyOwner, t.clientB.id, t.siblingMember)).toBe("already_owner")
  })

  it("6. nobody grants ownership with a direct update any more", async () => {
    const cases = [
      [t.agencyOwner, t.agency.id, t.agencyAdmin],
      [t.agencyOwner, t.clientA.id, t.clientAdmin],
      [t.clientOwner, t.clientA.id, t.clientMember],
    ] as const
    for (const [caller, workspaceId, target] of cases) {
      await expect(setRole(caller, workspaceId, target, "owner")).rejects.toThrow(
        /row-level security/
      )
    }
  })
})

describe("client continuity rule (private.protect_last_owner)", () => {
  let t: Setup
  beforeAll(async () => {
    t = await f.setup()
  })

  it("1. an agency owner may remove a client's only direct owner", async () => {
    const client = await f.createClient(t.agencyOwner, t.agency.id)
    const sole = await db.createUser(f.uniqueEmail("c1-sole"))
    await f.addMember(client.id, sole, "owner")

    const removed = await remove(t.agencyOwner, client.id, sole)
    expect(removed.affectedRows).toBe(1)
    expect(await f.visibleWorkspaceIds(t.agencyOwner)).toContain(client.id)
    expect(await ownershipIsValid()).toEqual([])
  })

  it("2. an agency owner may demote a client's only direct owner", async () => {
    const client = await f.createClient(t.agencyOwner, t.agency.id)
    const sole = await db.createUser(f.uniqueEmail("c2-sole"))
    await f.addMember(client.id, sole, "owner")

    const demoted = await setRole(t.agencyOwner, client.id, sole, "admin")
    expect(demoted.affectedRows).toBe(1)
    expect((await f.rolesIn(client.id))[sole]).toBe("admin")
  })

  it("3. a client's last direct owner may leave", async () => {
    const client = await f.createClient(t.agencyOwner, t.agency.id)
    const sole = await db.createUser(f.uniqueEmail("c3-sole"))
    await f.addMember(client.id, sole, "owner")

    expect((await leave(sole, client.id)).affectedRows).toBe(1)
    expect(await f.visibleWorkspaceIds(sole)).toEqual([])
    const left = (await f.auditEvents(client.id)).at(-1)
    expect(left).toMatchObject({ event_type: "workspace.member_left", actor_user_id: sole })
  })

  it("4. agency admins still never act on owners (0 rows), in clients too", async () => {
    expect((await remove(t.agencyAdmin, t.clientA.id, t.clientOwner)).affectedRows).toBe(0)
    expect((await setRole(t.agencyAdmin, t.clientA.id, t.clientOwner, "member")).affectedRows).toBe(
      0
    )
    expect((await remove(t.clientAdmin, t.clientA.id, t.clientOwner)).affectedRows).toBe(0)
    expect((await f.rolesIn(t.clientA.id))[t.clientOwner]).toBe("owner")
  })

  it("5. an agency must keep a direct owner: its last owner can't leave or be demoted", async () => {
    await expect(leave(t.agencyOwner, t.agency.id)).rejects.toThrow(/at least one owner/)
    await expect(setRole(t.agencyOwner, t.agency.id, t.agencyOwner, "admin")).rejects.toThrow(
      /at least one owner/
    )
  })

  it("6. the fallback needs a real agency owner: without one, a client keeps its direct owner", async () => {
    const agencyOwner = await db.createUser(f.uniqueEmail("c6-agency-owner"))
    const clientOwner = await db.createUser(f.uniqueEmail("c6-client-owner"))
    const agency = await f.createAgency(agencyOwner)
    const client = await f.createClient(agencyOwner, agency.id)
    await f.addMember(client.id, clientOwner, "owner")
    // The agency owner's account is deleted (a cascade, which the trigger lets through).
    await db.admin.query("delete from auth.users where id = $1", [agencyOwner])

    await expect(leave(clientOwner, client.id)).rejects.toThrow(/at least one owner/)

    // Account deletion is the one sanctioned way to end up ownerless; tidy up
    // so the invariant checks below only see ordinary workspaces.
    await db.admin.query("delete from public.workspaces where id = $1", [client.id])
    await db.admin.query("delete from public.workspaces where id = $1", [agency.id])
  })
})

describe("leaving a workspace", () => {
  let t: Setup
  beforeAll(async () => {
    t = await f.setup()
  })

  it("1. members and admins leave; access disappears; other memberships stay", async () => {
    const both = await db.createUser(f.uniqueEmail("l1-both"))
    await f.addMember(t.agency.id, both, "member")
    await f.addMember(t.clientB.id, both, "admin")

    expect((await leave(both, t.clientB.id)).affectedRows).toBe(1)
    expect(await f.visibleWorkspaceIds(both)).toEqual([t.agency.id])
    expect((await leave(both, t.agency.id)).affectedRows).toBe(1)
    expect(await f.visibleWorkspaceIds(both)).toEqual([])
    const left = (await f.auditEvents(t.agency.id)).at(-1)
    expect(left).toMatchObject({ event_type: "workspace.member_left", target_user_id: both })
  })

  it("2. an owner leaves when another direct owner remains", async () => {
    const owner = await db.createUser(f.uniqueEmail("l2-owner"))
    const coOwner = await db.createUser(f.uniqueEmail("l2-co-owner"))
    const agency = await f.createAgency(owner)
    await f.addMember(agency.id, coOwner, "owner")

    expect((await leave(owner, agency.id)).affectedRows).toBe(1)
    expect(await f.rolesIn(agency.id)).toEqual({ [coOwner]: "owner" })
  })

  it("3. an agency's last owner can't leave", async () => {
    const owner = await db.createUser(f.uniqueEmail("l3-owner"))
    const agency = await f.createAgency(owner)
    await expect(leave(owner, agency.id)).rejects.toThrow(/at least one owner/)
    expect(await f.rolesIn(agency.id)).toEqual({ [owner]: "owner" })
  })

  it("4. transfer, then leave, works", async () => {
    const owner = await db.createUser(f.uniqueEmail("l4-owner"))
    const heir = await db.createUser(f.uniqueEmail("l4-heir"))
    const agency = await f.createAgency(owner)
    await f.addMember(agency.id, heir, "member")

    expect(await transfer(owner, agency.id, heir)).toBe("transferred")
    expect((await leave(owner, agency.id)).affectedRows).toBe(1)
    expect(await f.rolesIn(agency.id)).toEqual({ [heir]: "owner" })
  })

  it("5. someone with only inherited access has no row to leave", async () => {
    expect((await leave(t.agencyAdmin, t.clientA.id)).affectedRows).toBe(0)
    expect(await f.visibleWorkspaceIds(t.agencyAdmin)).toContain(t.clientA.id)
  })

  it("6. nothing is left ownerless contrary to the policy", async () => {
    expect(await ownershipIsValid()).toEqual([])
  })
})

describe("role escalation", () => {
  let t: Setup
  beforeAll(async () => {
    t = await f.setup()
  })

  it("members can't make themselves admin", async () => {
    expect(
      (await setRole(t.clientMember, t.clientA.id, t.clientMember, "admin")).affectedRows
    ).toBe(0)
    expect((await setRole(t.agencyMember, t.agency.id, t.agencyMember, "admin")).affectedRows).toBe(
      0
    )
  })

  it("admins can't make themselves or anyone else owner, by any path", async () => {
    await expect(setRole(t.agencyAdmin, t.agency.id, t.agencyAdmin, "owner")).rejects.toThrow(
      /row-level security/
    )
    await expect(setRole(t.clientAdmin, t.clientA.id, t.clientMember, "owner")).rejects.toThrow(
      /row-level security/
    )
    await expect(makeOwner(t.clientAdmin, t.clientA.id, t.clientMember)).rejects.toThrow(
      /42501|client workspace/
    )
    await expect(makeOwner(t.agencyAdmin, t.clientA.id, t.clientAdmin)).rejects.toThrow(
      /client workspace/
    )
    await expect(transfer(t.agencyAdmin, t.agency.id, t.agencyMember)).rejects.toThrow(
      /direct owner/
    )
    await expect(transfer(t.clientAdmin, t.clientA.id, t.clientMember)).rejects.toThrow(
      /direct owner/
    )
  })

  it("members can't invite or revoke", async () => {
    await expect(
      f.invite(t.clientMember, t.clientA.id, f.uniqueEmail("escalation-invite"))
    ).rejects.toThrow(/Not allowed to invite/)
    const invitation = await f.invite(
      t.clientOwner,
      t.clientA.id,
      f.uniqueEmail("escalation-revoke")
    )
    await expect(
      db.asUser(t.clientMember, (tx) =>
        scalar(tx, "public.revoke_workspace_invitation($1, $2)", [t.clientA.id, invitation.id])
      )
    ).rejects.toThrow(/Not allowed to manage invitations/)
  })

  it("a client admin can't touch a sibling client", async () => {
    expect(
      (await setRole(t.clientAdmin, t.clientB.id, t.siblingMember, "admin")).affectedRows
    ).toBe(0)
    expect((await remove(t.clientAdmin, t.clientB.id, t.siblingMember)).affectedRows).toBe(0)
    await expect(
      f.invite(t.clientAdmin, t.clientB.id, f.uniqueEmail("sibling-invite"))
    ).rejects.toThrow(/Not allowed to invite/)
  })

  it("agency admins manage client members below owner, and nothing more", async () => {
    const target = await db.createUser(f.uniqueEmail("aa-target"))
    await f.addMember(t.clientA.id, target, "member")
    expect((await setRole(t.agencyAdmin, t.clientA.id, target, "admin")).affectedRows).toBe(1)
    expect((await remove(t.agencyAdmin, t.clientA.id, target)).affectedRows).toBe(1)
    // …but never another agency's clients.
    const other = await db.createUser(f.uniqueEmail("aa-other"))
    await f.addMember(t.otherClient.id, other, "member")
    expect((await setRole(t.agencyAdmin, t.otherClient.id, other, "admin")).affectedRows).toBe(0)
    expect((await remove(t.agencyAdmin, t.otherClient.id, other)).affectedRows).toBe(0)
  })

  it("agency members don't inherit client access; client members stay in their client", async () => {
    expect(await f.visibleWorkspaceIds(t.agencyMember)).toEqual([t.agency.id])
    expect(await f.visibleWorkspaceIds(t.clientMember)).toEqual([t.clientA.id])
    expect(await f.visibleWorkspaceIds(t.agencyAdmin)).toEqual(
      [t.agency.id, t.clientA.id, t.clientB.id].sort()
    )
    expect(await f.visibleWorkspaceIds(t.agencyAdmin)).not.toContain(t.otherClient.id)
  })
})
