import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { fixtures, scalar, type Setup } from "./helpers/fixtures"
import { createTestDb, type TestDb, type Tx } from "./helpers/test-db"

/**
 * Sprint 4: the audit log's read path, public.list_workspace_audit_events().
 * Owners and admins read their workspace's events (agency owners and admins
 * their clients' too); members, outsiders and anon can't; nothing crosses
 * tenants; the table stays append-only; details are display values only.
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

type AuditRow = {
  id: string
  created_at: string
  event_type: string
  actor_name: string | null
  target_name: string | null
  target_email: string | null
  details: Record<string, unknown>
}

type Filters = {
  limit?: number
  beforeId?: string | null
  eventType?: string | null
  actorId?: string | null
  from?: string | null
  to?: string | null
}

const readAs =
  (runner: (fn: (tx: Tx) => Promise<AuditRow[]>) => Promise<AuditRow[]>) =>
  (workspaceId: string, filters: Filters = {}) =>
    runner(async (tx) => {
      const { rows } = await tx.query<AuditRow>(
        "select * from public.list_workspace_audit_events($1, $2, $3, $4, $5, $6, $7)",
        [
          workspaceId,
          filters.limit ?? 50,
          filters.beforeId ?? null,
          filters.eventType ?? null,
          filters.actorId ?? null,
          filters.from ?? null,
          filters.to ?? null,
        ]
      )
      return rows
    })

const readAsUser = (userId: string, workspaceId: string, filters: Filters = {}) =>
  readAs((fn) => db.asUser(userId, fn))(workspaceId, filters)

describe("who can read a workspace's audit log", () => {
  let t: Setup
  beforeAll(async () => {
    t = await f.setup()
  })

  it("owners and admins read it; members don't", async () => {
    expect((await readAsUser(t.agencyOwner, t.agency.id)).length).toBeGreaterThan(0)
    expect((await readAsUser(t.agencyAdmin, t.agency.id)).length).toBeGreaterThan(0)
    expect((await readAsUser(t.clientOwner, t.clientA.id)).length).toBeGreaterThan(0)
    expect((await readAsUser(t.clientAdmin, t.clientA.id)).length).toBeGreaterThan(0)
    await expect(readAsUser(t.agencyMember, t.agency.id)).rejects.toThrow(/owners and admins/)
    await expect(readAsUser(t.clientMember, t.clientA.id)).rejects.toThrow(/owners and admins/)
  })

  it("agency owners and admins read their own clients' logs, never another agency's", async () => {
    expect((await readAsUser(t.agencyAdmin, t.clientA.id)).length).toBeGreaterThan(0)
    expect((await readAsUser(t.agencyOwner, t.clientB.id)).length).toBeGreaterThan(0)
    await expect(readAsUser(t.agencyAdmin, t.otherClient.id)).rejects.toThrow(/owners and admins/)
    await expect(readAsUser(t.agencyOwner, t.otherAgency.id)).rejects.toThrow(/owners and admins/)
    await expect(readAsUser(t.otherOwner, t.clientA.id)).rejects.toThrow(/owners and admins/)
  })

  it("a client's owners and admins can't read the agency's log or a sibling's", async () => {
    await expect(readAsUser(t.clientOwner, t.agency.id)).rejects.toThrow(/owners and admins/)
    await expect(readAsUser(t.clientAdmin, t.clientB.id)).rejects.toThrow(/owners and admins/)
    await expect(readAsUser(t.outsider, t.agency.id)).rejects.toThrow(/owners and admins/)
  })

  it("anon can't call it at all", async () => {
    await expect(readAs((fn) => db.asAnon(fn))(t.agency.id)).rejects.toThrow(/permission denied/)
  })

  it("the table stays unreadable and append-only for every API role", async () => {
    const runners = [
      (fn: (tx: Tx) => Promise<unknown>) => db.asAnon(fn),
      (fn: (tx: Tx) => Promise<unknown>) => db.asUser(t.agencyOwner, fn),
    ]
    for (const run of runners) {
      await expect(run((tx) => tx.query("select * from private.audit_log"))).rejects.toThrow(
        /permission denied/
      )
    }
    for (const run of [...runners, (fn: (tx: Tx) => Promise<unknown>) => db.asServiceRole(fn)]) {
      await expect(
        run((tx) => tx.query("update private.audit_log set event_type = 'workspace.forged'"))
      ).rejects.toThrow(/permission denied/)
      await expect(run((tx) => tx.query("delete from private.audit_log"))).rejects.toThrow(
        /permission denied/
      )
    }
  })
})

describe("what the log shows", () => {
  let t: Setup
  let sarah: string
  let sarahEmail: string
  beforeAll(async () => {
    t = await f.setup()
    sarahEmail = f.uniqueEmail("sarah")
    sarah = await db.createUser(sarahEmail, { full_name: "Sarah Jones" })
  })

  it("records every membership event, newest first, with names instead of ids", async () => {
    const agency = await f.createAgency(t.agencyOwner)
    const invited = await f.invite(t.agencyOwner, agency.id, sarahEmail, "member")
    await db.asUser(t.agencyOwner, (tx) =>
      scalar(tx, "(select outcome from public.resend_workspace_invitation($1, $2, $3))", [
        agency.id,
        invited.id,
        f.newTokenHash(),
      ])
    )
    const { rows } = await db.admin.query<{ token_hash: string }>(
      "select token_hash from public.workspace_invitations where id = $1",
      [invited.id]
    )
    const currentHash = rows[0]?.token_hash ?? ""
    await db.asUser(sarah, (tx) =>
      tx.query("select * from public.accept_workspace_invitation($1)", [currentHash])
    )
    await db.asUser(t.agencyOwner, (tx) =>
      tx.query(
        "update public.workspace_members set role = 'admin' where workspace_id = $1 and user_id = $2",
        [agency.id, sarah]
      )
    )
    await db.asUser(t.agencyOwner, (tx) =>
      scalar(tx, "public.transfer_workspace_ownership($1, $2)", [agency.id, sarah])
    )
    const revoked = await f.invite(sarah, agency.id, f.uniqueEmail("revoked"))
    await db.asUser(sarah, (tx) =>
      scalar(tx, "public.revoke_workspace_invitation($1, $2)", [agency.id, revoked.id])
    )
    const client = await f.createClient(sarah, agency.id, "Roofing")
    const leaver = await db.createUser(f.uniqueEmail("leaver"))
    const removed = await db.createUser(f.uniqueEmail("removed"))
    await f.addMember(client.id, leaver, "member")
    await f.addMember(client.id, removed, "member")
    await db.asUser(leaver, (tx) =>
      tx.query("delete from public.workspace_members where workspace_id = $1 and user_id = $2", [
        client.id,
        leaver,
      ])
    )
    await db.asUser(sarah, (tx) =>
      tx.query("delete from public.workspace_members where workspace_id = $1 and user_id = $2", [
        client.id,
        removed,
      ])
    )
    await db.asUser(sarah, (tx) =>
      scalar(tx, "public.make_workspace_owner($1, $2)", [client.id, t.clientMember]).catch(
        () => null
      )
    )

    const agencyLog = await readAsUser(sarah, agency.id)
    expect(agencyLog.map((row) => row.event_type)).toEqual([
      "workspace.client_created",
      "workspace.invitation_revoked",
      "workspace.member_invited",
      "workspace.ownership_transferred",
      "workspace.member_role_changed",
      "workspace.invitation_accepted",
      "workspace.member_added",
      "workspace.invitation_resent",
      "workspace.member_invited",
      "workspace.member_added",
    ])
    const byType = Object.fromEntries(agencyLog.map((row) => [row.event_type, row]))
    expect(byType["workspace.ownership_transferred"]).toMatchObject({
      actor_name: "Ada Owner",
      target_name: "Sarah Jones",
      details: { from: "admin", to: "owner", previous_owner_role: "admin" },
    })
    expect(byType["workspace.client_created"]).toMatchObject({
      actor_name: "Sarah Jones",
      details: { client_name: client.name },
    })
    expect(byType["workspace.invitation_accepted"]?.details).toEqual({
      role: "member",
      already_member: false,
      method: "link",
    })

    const clientLog = await readAsUser(sarah, client.id)
    expect(clientLog.map((row) => row.event_type)).toEqual([
      "workspace.member_removed",
      "workspace.member_left",
      "workspace.member_added",
      "workspace.member_added",
    ])

    // No ids, tokens or hashes anywhere in what readers get.
    const everything = JSON.stringify([...agencyLog, ...clientLog])
    expect(everything).not.toContain(invited.id)
    expect(everything).not.toContain(invited.tokenHash)
    expect(everything).not.toContain(currentHash)
    expect(everything).not.toContain(client.id)
    expect(everything).not.toContain(sarah)
  })

  it("records make-owner in the client's log", async () => {
    const client = await f.createClient(t.agencyOwner, t.agency.id)
    const rep = await db.createUser(f.uniqueEmail("rep"), { full_name: "Rita Rep" })
    await f.addMember(client.id, rep, "admin")
    await db.asUser(t.agencyOwner, (tx) =>
      scalar(tx, "public.make_workspace_owner($1, $2)", [client.id, rep])
    )
    const [latest] = await readAsUser(t.agencyAdmin, client.id)
    expect(latest).toMatchObject({
      event_type: "workspace.owner_granted",
      actor_name: "Ada Owner",
      target_name: "Rita Rep",
      details: { from: "admin", to: "owner" },
    })
  })
})

describe("filters and paging", () => {
  let t: Setup
  let workspaceId: string
  beforeAll(async () => {
    t = await f.setup()
    const agency = await f.createAgency(t.agencyOwner)
    workspaceId = agency.id
    for (let index = 0; index < 5; index++) {
      await f.invite(t.agencyOwner, workspaceId, f.uniqueEmail(`page-${index}`))
    }
    await f.addMember(workspaceId, t.agencyAdmin, "admin")
    await f.invite(t.agencyAdmin, workspaceId, f.uniqueEmail("by-admin"))
  })

  it("pages newest first with a keyset cursor, without gaps or repeats", async () => {
    const all = await readAsUser(t.agencyOwner, workspaceId)
    const seen: string[] = []
    let beforeId: string | null = null
    for (;;) {
      const page: AuditRow[] = await readAsUser(t.agencyOwner, workspaceId, { limit: 3, beforeId })
      if (page.length === 0) break
      seen.push(...page.map((row) => row.id))
      beforeId = page.at(-1)?.id ?? null
    }
    expect(seen).toEqual(all.map((row) => row.id))
    expect(new Set(seen).size).toBe(all.length)
  })

  it("a cursor from another workspace returns nothing", async () => {
    // A fresh event elsewhere, newer than everything here: honouring it would page back through
    // this workspace's whole log.
    await f.invite(t.agencyOwner, t.agency.id, f.uniqueEmail("foreign-cursor"))
    const [foreign] = await readAsUser(t.agencyOwner, t.agency.id)
    expect(await readAsUser(t.agencyOwner, workspaceId, { beforeId: foreign?.id })).toEqual([])
  })

  it("filters by action and actor", async () => {
    const invites = await readAsUser(t.agencyOwner, workspaceId, {
      eventType: "workspace.member_invited",
    })
    expect(invites).toHaveLength(6)
    const byAdmin = await readAsUser(t.agencyOwner, workspaceId, { actorId: t.agencyAdmin })
    expect(byAdmin.map((row) => row.event_type)).toEqual(["workspace.member_invited"])
  })

  it("filters by calendar days in the workspace's time zone, inclusive", async () => {
    await db.admin.query(
      "update public.workspaces set timezone = 'America/Chicago' where id = $1",
      [workspaceId]
    )
    const { rows } = await db.admin.query<{ id: string }>(
      `update private.audit_log set created_at = '2026-01-10 05:30:00+00'
       where id = (select min(id) from private.audit_log where workspace_id = $1) returning id`,
      [workspaceId]
    )
    const moved = rows[0]?.id
    // 05:30 UTC on Jan 10 is 23:30 on Jan 9 in Chicago.
    const jan9 = await readAsUser(t.agencyOwner, workspaceId, {
      from: "2026-01-09",
      to: "2026-01-09",
    })
    expect(jan9.map((row) => row.id)).toEqual([moved])
    expect(
      await readAsUser(t.agencyOwner, workspaceId, { from: "2026-01-10", to: "2026-01-10" })
    ).toEqual([])
  })

  it("caps a page at 100 rows and ignores silly limits", async () => {
    const zero = await readAsUser(t.agencyOwner, workspaceId, { limit: 0 })
    expect(zero).toHaveLength(1)
    const huge = await readAsUser(t.agencyOwner, workspaceId, { limit: 100_000 })
    expect(huge.length).toBeLessThanOrEqual(100)
  })
})
