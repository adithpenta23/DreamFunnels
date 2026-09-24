import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createTestDb, type TestDb } from "./helpers/test-db"

/**
 * Agency -> client tenancy (Sprint 2). Proves the access rule in
 * private.user_workspace_ids() / private.workspace_role():
 *   - direct membership always works;
 *   - agency owners and admins reach their agency's clients (as owner/admin);
 *   - agency members, client members and other agencies reach nothing extra;
 *   - nobody can re-parent or re-type a workspace through the API;
 *   - the schema rejects impossible hierarchies.
 */

type Role = "member" | "admin" | "owner"

let db: TestDb
let sequence = 0

beforeAll(async () => {
  db = await createTestDb()
})

afterAll(async () => {
  await db.close()
})

const uniqueEmail = (name: string) => `${name}.${++sequence}@example.test`
const uniqueSlug = (name: string) => `${name}-${++sequence}`

async function createAgency(ownerId: string, name: string) {
  const { rows } = await db.asUser(ownerId, (tx) =>
    tx.query<{ id: string; slug: string }>("select id, slug from public.create_workspace($1, $2)", [
      name,
      uniqueSlug("agency"),
    ])
  )
  const row = rows[0]
  if (!row) throw new Error("create_workspace returned no row")
  return row
}

/** Stands in for the future agency provisioning function (trusted, bypasses RLS). */
async function createClient(agencyId: string, name: string) {
  const { rows } = await db.admin.query<{ id: string; slug: string }>(
    `insert into public.workspaces (name, slug, workspace_type, parent_workspace_id)
     values ($1, $2, 'client', $3) returning id, slug`,
    [name, uniqueSlug("client"), agencyId]
  )
  const row = rows[0]
  if (!row) throw new Error("client insert returned no row")
  return row
}

async function addMember(workspaceId: string, userId: string, role: Role) {
  // Stands in for the future accept_invitation() function.
  await db.admin.query(
    "insert into public.workspace_members (workspace_id, user_id, role) values ($1, $2, $3)",
    [workspaceId, userId, role]
  )
}

/**
 * Agency with an owner, an admin and a member; two clients (A with a member
 * and an owner of its own, B empty); plus a second, unrelated agency with a
 * client of its own.
 */
async function setupAgency() {
  const agencyOwner = await db.createUser(uniqueEmail("agency-owner"))
  const agencyAdmin = await db.createUser(uniqueEmail("agency-admin"))
  const agencyMember = await db.createUser(uniqueEmail("agency-member"))
  const clientMember = await db.createUser(uniqueEmail("client-member"))
  const clientOwner = await db.createUser(uniqueEmail("client-owner"))
  const otherAgencyOwner = await db.createUser(uniqueEmail("other-owner"))
  const otherAgencyAdmin = await db.createUser(uniqueEmail("other-admin"))

  const agency = await createAgency(agencyOwner, "Agency")
  await addMember(agency.id, agencyAdmin, "admin")
  await addMember(agency.id, agencyMember, "member")

  const clientA = await createClient(agency.id, "Client A")
  const clientB = await createClient(agency.id, "Client B")
  await addMember(clientA.id, clientMember, "member")
  await addMember(clientA.id, clientOwner, "owner")

  const otherAgency = await createAgency(otherAgencyOwner, "Other agency")
  await addMember(otherAgency.id, otherAgencyAdmin, "admin")
  const otherClient = await createClient(otherAgency.id, "Other client")

  return {
    agencyOwner,
    agencyAdmin,
    agencyMember,
    clientMember,
    clientOwner,
    otherAgencyOwner,
    otherAgencyAdmin,
    agency,
    clientA,
    clientB,
    otherAgency,
    otherClient,
  }
}

type Setup = Awaited<ReturnType<typeof setupAgency>>

async function visibleWorkspaceIds(userId: string) {
  const { rows } = await db.asUser(userId, (tx) =>
    tx.query<{ id: string }>("select id from public.workspaces order by created_at, id")
  )
  return rows.map((row) => row.id).sort()
}

/** The caller's effective role in each visible workspace (the PostgREST computed field). */
async function viewerRoles(userId: string) {
  const { rows } = await db.asUser(userId, (tx) =>
    tx.query<{ id: string; role: Role | null }>(
      "select w.id, public.viewer_role(w) as role from public.workspaces w"
    )
  )
  return Object.fromEntries(rows.map((row) => [row.id, row.role]))
}

const sorted = (...ids: string[]) => [...ids].sort()

describe("agency access (who sees which workspace)", () => {
  let t: Setup
  beforeAll(async () => {
    t = await setupAgency()
  })

  it("1. an agency owner sees their agency", async () => {
    expect(await visibleWorkspaceIds(t.agencyOwner)).toContain(t.agency.id)
  })

  it("2. an agency owner sees every client of their agency, as owner", async () => {
    expect(await visibleWorkspaceIds(t.agencyOwner)).toEqual(
      sorted(t.agency.id, t.clientA.id, t.clientB.id)
    )
    expect(await viewerRoles(t.agencyOwner)).toEqual({
      [t.agency.id]: "owner",
      [t.clientA.id]: "owner",
      [t.clientB.id]: "owner",
    })
  })

  it("3. an agency admin sees the agency's clients, as admin", async () => {
    expect(await visibleWorkspaceIds(t.agencyAdmin)).toEqual(
      sorted(t.agency.id, t.clientA.id, t.clientB.id)
    )
    expect(await viewerRoles(t.agencyAdmin)).toEqual({
      [t.agency.id]: "admin",
      [t.clientA.id]: "admin",
      [t.clientB.id]: "admin",
    })
  })

  it("4. an agency member does not inherit access to clients", async () => {
    expect(await visibleWorkspaceIds(t.agencyMember)).toEqual([t.agency.id])

    const { rows } = await db.asUser(t.agencyMember, (tx) =>
      tx.query("select id from public.workspaces where id = $1", [t.clientA.id])
    )
    expect(rows).toHaveLength(0)
  })

  it("4b. gives agency members no role at all in clients (for future role-gated policies)", async () => {
    const { rows } = await db.asUser(t.agencyMember, (tx) =>
      tx.query<{ role: Role | null; member: boolean; admin: boolean }>(
        `select private.workspace_role($1) as role,
                private.has_workspace_role($1, 'member') as member,
                private.has_workspace_role($1, 'admin') as admin`,
        [t.clientA.id]
      )
    )
    expect(rows).toEqual([{ role: null, member: false, admin: false }])
  })

  it("5. a client member sees their own client workspace, with their direct role", async () => {
    expect(await visibleWorkspaceIds(t.clientMember)).toEqual([t.clientA.id])
    expect(await viewerRoles(t.clientMember)).toEqual({ [t.clientA.id]: "member" })
  })

  it("6. a client member cannot see a sibling client", async () => {
    const { rows } = await db.asUser(t.clientMember, (tx) =>
      tx.query("select id from public.workspaces where id = $1", [t.clientB.id])
    )
    expect(rows).toHaveLength(0)
  })

  it("7. client members, even client owners, cannot see the parent agency or its people", async () => {
    for (const userId of [t.clientMember, t.clientOwner]) {
      const agency = await db.asUser(userId, (tx) =>
        tx.query("select id from public.workspaces where id = $1", [t.agency.id])
      )
      const agencyMembers = await db.asUser(userId, (tx) =>
        tx.query("select user_id from public.workspace_members where workspace_id = $1", [
          t.agency.id,
        ])
      )
      const agencyOwnerProfile = await db.asUser(userId, (tx) =>
        tx.query("select id from public.profiles where id = $1", [t.agencyOwner])
      )
      expect(agency.rows).toHaveLength(0)
      expect(agencyMembers.rows).toHaveLength(0)
      expect(agencyOwnerProfile.rows).toHaveLength(0)
    }
    // A client owner's reach stops at their own client.
    expect(await visibleWorkspaceIds(t.clientOwner)).toEqual([t.clientA.id])
  })

  it("8. an admin of another agency cannot see or change this agency's clients", async () => {
    expect(await visibleWorkspaceIds(t.otherAgencyAdmin)).toEqual(
      sorted(t.otherAgency.id, t.otherClient.id)
    )
    const rename = await db.asUser(t.otherAgencyAdmin, (tx) =>
      tx.query("update public.workspaces set name = 'pwned' where id = $1", [t.clientA.id])
    )
    const removeMember = await db.asUser(t.otherAgencyOwner, (tx) =>
      tx.query("delete from public.workspace_members where workspace_id = $1", [t.clientA.id])
    )
    expect(rename.affectedRows).toBe(0)
    expect(removeMember.affectedRows).toBe(0)
  })

  it("lets agency admins read the people in their clients, but not the other way round", async () => {
    const clientPeople = await db.asUser(t.agencyAdmin, (tx) =>
      tx.query<{ user_id: string }>(
        "select user_id from public.workspace_members where workspace_id = $1",
        [t.clientA.id]
      )
    )
    expect(clientPeople.rows.map((row) => row.user_id).sort()).toEqual(
      sorted(t.clientMember, t.clientOwner)
    )
    const profile = await db.asUser(t.agencyAdmin, (tx) =>
      tx.query("select id from public.profiles where id = $1", [t.clientMember])
    )
    expect(profile.rows).toHaveLength(1)
  })

  it("follows role changes immediately: an agency admin demoted to member loses client access", async () => {
    const s = await setupAgency()
    expect(await visibleWorkspaceIds(s.agencyAdmin)).toContain(s.clientA.id)

    await db.asUser(s.agencyOwner, (tx) =>
      tx.query(
        "update public.workspace_members set role = 'member' where workspace_id = $1 and user_id = $2",
        [s.agency.id, s.agencyAdmin]
      )
    )
    expect(await visibleWorkspaceIds(s.agencyAdmin)).toEqual([s.agency.id])
  })

  it("keeps a direct client role when it is higher than the inherited one", async () => {
    const s = await setupAgency()
    // The agency admin is also a direct owner of client B.
    await addMember(s.clientB.id, s.agencyAdmin, "owner")
    const roles = await viewerRoles(s.agencyAdmin)
    expect(roles[s.clientB.id]).toBe("owner")
    expect(roles[s.clientA.id]).toBe("admin")
  })
})

describe("agency roles in client workspaces (write policies)", () => {
  it("lets agency admins manage a client's settings, but not agency members", async () => {
    const t = await setupAgency()
    const byMember = await db.asUser(t.agencyMember, (tx) =>
      tx.query("update public.workspaces set name = 'Member edit' where id = $1", [t.clientA.id])
    )
    const byAdmin = await db.asUser(t.agencyAdmin, (tx) =>
      tx.query("update public.workspaces set name = 'Admin edit', timezone = $2 where id = $1", [
        t.clientA.id,
        "America/Chicago",
      ])
    )
    expect(byMember.affectedRows).toBe(0)
    expect(byAdmin.affectedRows).toBe(1)
  })

  it("lets client admins manage their client but never the agency above it", async () => {
    const t = await setupAgency()
    const own = await db.asUser(t.clientOwner, (tx) =>
      tx.query("update public.workspaces set business_name = 'Client Co' where id = $1", [
        t.clientA.id,
      ])
    )
    const agency = await db.asUser(t.clientOwner, (tx) =>
      tx.query("update public.workspaces set name = 'Hijacked' where id = $1", [t.agency.id])
    )
    expect(own.affectedRows).toBe(1)
    expect(agency.affectedRows).toBe(0)
  })

  it("lets agency admins change client roles below owner; only agency owners grant ownership (through make_workspace_owner)", async () => {
    const t = await setupAgency()
    const promote = await db.asUser(t.agencyAdmin, (tx) =>
      tx.query(
        "update public.workspace_members set role = 'admin' where workspace_id = $1 and user_id = $2",
        [t.clientA.id, t.clientMember]
      )
    )
    expect(promote.affectedRows).toBe(1)

    await expect(
      db.asUser(t.agencyAdmin, (tx) =>
        tx.query(
          "update public.workspace_members set role = 'owner' where workspace_id = $1 and user_id = $2",
          [t.clientA.id, t.clientMember]
        )
      )
    ).rejects.toThrow(/row-level security/)

    // Sprint 4: ownership is granted only by the audited functions, never by a
    // direct update, not even by an owner.
    await expect(
      db.asUser(t.agencyOwner, (tx) =>
        tx.query(
          "update public.workspace_members set role = 'owner' where workspace_id = $1 and user_id = $2",
          [t.clientA.id, t.clientMember]
        )
      )
    ).rejects.toThrow(/row-level security/)
    const byOwner = await db.asUser(t.agencyOwner, (tx) =>
      tx.query<{ outcome: string }>("select public.make_workspace_owner($1, $2) as outcome", [
        t.clientA.id,
        t.clientMember,
      ])
    )
    expect(byOwner.rows[0]?.outcome).toBe("granted")
  })

  it("only agency owners (as effective owners) can delete a client workspace", async () => {
    const t = await setupAgency()
    const byAdmin = await db.asUser(t.agencyAdmin, (tx) =>
      tx.query("delete from public.workspaces where id = $1", [t.clientB.id])
    )
    const byClientMember = await db.asUser(t.clientMember, (tx) =>
      tx.query("delete from public.workspaces where id = $1", [t.clientA.id])
    )
    expect(byAdmin.affectedRows).toBe(0)
    expect(byClientMember.affectedRows).toBe(0)

    const byOwner = await db.asUser(t.agencyOwner, (tx) =>
      tx.query("delete from public.workspaces where id = $1", [t.clientB.id])
    )
    expect(byOwner.affectedRows).toBe(1)
  })

  it("gives agency staff no way to add themselves to a client directly", async () => {
    const t = await setupAgency()
    await expect(
      db.asUser(t.agencyAdmin, (tx) =>
        tx.query(
          "insert into public.workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')",
          [t.clientA.id, t.agencyAdmin]
        )
      )
    ).rejects.toThrow(/permission denied/)
  })
})

describe("9. rows and workspaces can't be moved between tenants", () => {
  it("rejects moving a membership to another workspace", async () => {
    const t = await setupAgency()
    await expect(
      db.asUser(t.agencyOwner, (tx) =>
        tx.query(
          "update public.workspace_members set workspace_id = $1 where workspace_id = $2 and user_id = $3",
          [t.clientB.id, t.clientA.id, t.clientMember]
        )
      )
    ).rejects.toThrow(/permission denied/)
  })

  it.each([
    ["re-parent a client to another agency", "parent_workspace_id = $2", "otherAgency"],
    ["detach a client from its agency", "parent_workspace_id = null", null],
    ["turn a client into an agency", "workspace_type = 'agency'", null],
  ] as const)("rejects attempts to %s, even by the agency owner", async (_label, set, param) => {
    const t = await setupAgency()
    const params = param ? [t.clientA.id, t[param].id] : [t.clientA.id]
    for (const userId of [t.agencyOwner, t.clientOwner]) {
      await expect(
        db.asUser(userId, (tx) =>
          tx.query(`update public.workspaces set ${set} where id = $1`, params)
        )
      ).rejects.toThrow(/permission denied/)
    }
  })

  it("rejects making an agency a client of another agency", async () => {
    const t = await setupAgency()
    await expect(
      db.asUser(t.agencyOwner, (tx) =>
        tx.query(
          "update public.workspaces set workspace_type = 'client', parent_workspace_id = $2 where id = $1",
          [t.agency.id, t.otherAgency.id]
        )
      )
    ).rejects.toThrow(/permission denied/)
  })

  it("never lets create_workspace() create a client", async () => {
    const userId = await db.createUser(uniqueEmail("creator"))
    const workspace = await createAgency(userId, "Self-serve")
    const { rows } = await db.admin.query(
      "select workspace_type, parent_workspace_id from public.workspaces where id = $1",
      [workspace.id]
    )
    expect(rows).toEqual([{ workspace_type: "agency", parent_workspace_id: null }])
  })
})

describe("10. anonymous access", () => {
  it("denies anonymous reads of workspaces and the viewer_role computed field", async () => {
    await expect(db.asAnon((tx) => tx.query("select id from public.workspaces"))).rejects.toThrow(
      /permission denied/
    )
    await expect(
      db.asAnon((tx) => tx.query("select public.viewer_role(null::public.workspaces)"))
    ).rejects.toThrow(/permission denied/)
  })
})

describe("11. the schema rejects invalid hierarchies", () => {
  let t: Setup
  beforeAll(async () => {
    t = await setupAgency()
  })

  const insertWorkspace = (type: string, parentId: string | null, id?: string) =>
    db.admin.query(
      `insert into public.workspaces (id, name, slug, workspace_type, parent_workspace_id)
       values (coalesce($1::uuid, gen_random_uuid()), 'Bad', $2, $3::public.workspace_type, $4)`,
      [id ?? null, uniqueSlug("bad"), type, parentId]
    )

  it("rejects an agency with a parent", async () => {
    await expect(insertWorkspace("agency", t.agency.id)).rejects.toThrow(
      /workspaces_hierarchy_check/
    )
  })

  it("rejects a client without a parent", async () => {
    await expect(insertWorkspace("client", null)).rejects.toThrow(/workspaces_hierarchy_check/)
  })

  it("rejects a client whose parent is a client (depth stays at one level)", async () => {
    await expect(insertWorkspace("client", t.clientA.id)).rejects.toThrow(/workspaces_parent_fkey/)
  })

  it("rejects a parent that doesn't exist", async () => {
    await expect(insertWorkspace("client", "00000000-0000-4000-8000-000000000000")).rejects.toThrow(
      /workspaces_parent_fkey/
    )
  })

  it("rejects a workspace that is its own parent", async () => {
    const id = "11111111-1111-4111-8111-111111111111"
    await expect(insertWorkspace("client", id, id)).rejects.toThrow(
      /workspaces_not_own_parent|workspaces_parent_fkey/
    )
  })

  it("rejects turning an agency that has clients into a client", async () => {
    await expect(
      db.admin.query(
        "update public.workspaces set workspace_type = 'client', parent_workspace_id = $2 where id = $1",
        [t.agency.id, t.otherAgency.id]
      )
    ).rejects.toThrow(/workspaces_parent_fkey/)
  })

  it("refuses to delete an agency that still has clients instead of cascading into them", async () => {
    await expect(
      db.asUser(t.agencyOwner, (tx) =>
        tx.query("delete from public.workspaces where id = $1", [t.agency.id])
      )
    ).rejects.toThrow(/workspaces_parent_fkey/)

    const { rows } = await db.admin.query(
      "select count(*)::int as clients from public.workspaces where parent_workspace_id = $1",
      [t.agency.id]
    )
    expect(rows).toEqual([{ clients: 2 }])
  })

  it("allows re-parenting to another agency for trusted code", async () => {
    const s = await setupAgency()
    const moved = await db.admin.query(
      "update public.workspaces set parent_workspace_id = $2 where id = $1",
      [s.clientB.id, s.otherAgency.id]
    )
    expect(moved.affectedRows).toBe(1)
    // Access follows the new parent at once.
    expect(await visibleWorkspaceIds(s.agencyAdmin)).not.toContain(s.clientB.id)
    expect(await visibleWorkspaceIds(s.otherAgencyAdmin)).toContain(s.clientB.id)
  })
})

describe("12. existing flat workspaces migrate safely", () => {
  let legacy: TestDb
  afterAll(async () => {
    await legacy?.close()
  })

  it("turns every existing workspace into an agency with defaults, keeping access intact", async () => {
    legacy = await createTestDb({
      stopBefore: "20260923000000_workspace_hierarchy_and_profiles.sql",
    })

    const owner = await legacy.createUser("legacy-owner@example.test", { full_name: "Legacy" })
    const member = await legacy.createUser("legacy-member@example.test")
    const outsider = await legacy.createUser("legacy-outsider@example.test")
    // The Sprint 1 signature: create_workspace(name, slug).
    const { rows: created } = await legacy.asUser(owner, (tx) =>
      tx.query<{ id: string }>("select id from public.create_workspace($1, $2)", [
        "Legacy Co",
        "legacy-co",
      ])
    )
    const workspaceId = created[0]?.id
    await legacy.admin.query(
      "insert into public.workspace_members (workspace_id, user_id, role) values ($1, $2, 'member')",
      [workspaceId, member]
    )

    await legacy.applyRemainingMigrations()

    const { rows: workspaces } = await legacy.admin.query(
      `select name, slug, workspace_type, parent_workspace_id, parent_workspace_type, timezone,
              business_name, business_phone, logo_url, brand_primary_color
       from public.workspaces`
    )
    expect(workspaces).toEqual([
      {
        name: "Legacy Co",
        slug: "legacy-co",
        workspace_type: "agency",
        parent_workspace_id: null,
        parent_workspace_type: null,
        timezone: "UTC",
        business_name: null,
        business_phone: null,
        logo_url: null,
        brand_primary_color: null,
      },
    ])

    const { rows: profiles } = await legacy.admin.query(
      "select full_name, phone, timezone, locale from public.profiles where id = $1",
      [owner]
    )
    expect(profiles).toEqual([
      { full_name: "Legacy", phone: null, timezone: "UTC", locale: "en-US" },
    ])

    // Access is unchanged: members still see it (with their role), outsiders don't.
    const memberView = await legacy.asUser(member, (tx) =>
      tx.query("select w.id, public.viewer_role(w) as role from public.workspaces w")
    )
    expect(memberView.rows).toEqual([{ id: workspaceId, role: "member" }])
    const outsiderView = await legacy.asUser(outsider, (tx) =>
      tx.query("select id from public.workspaces")
    )
    expect(outsiderView.rows).toHaveLength(0)

    // Older app versions call create_workspace with named arguments; still works.
    const { rows: again } = await legacy.asUser(owner, (tx) =>
      tx.query<{ timezone: string }>(
        "select timezone from public.create_workspace(p_name => $1, p_slug => $2)",
        ["Second", null]
      )
    )
    expect(again).toEqual([{ timezone: "UTC" }])
  })
})
