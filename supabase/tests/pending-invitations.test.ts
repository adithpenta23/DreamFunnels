import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { fixtures, type Setup } from "./helpers/fixtures"
import { createTestDb, type TestDb, type Tx } from "./helpers/test-db"

/**
 * Sprint 4 invitation fallback: a signed-in user sees the open invitations for
 * their verified email (list_my_pending_invitations) and accepts one by id
 * (accept_workspace_invitation_by_id). Both acceptance paths share
 * private.accept_invitation(), so the token path is re-checked here too.
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

type Pending = {
  invitation_id: string
  workspace_name: string
  role: string
  inviter_name: string | null
  expires_at: string
  created_at: string
}

const pendingFor = (userId: string) =>
  db.asUser(userId, async (tx) => {
    const { rows } = await tx.query<Pending>("select * from public.list_my_pending_invitations()")
    return rows
  })

const acceptById = async (userId: string, invitationId: string) => {
  const { rows } = await db.asUser(userId, (tx) =>
    tx.query<{ outcome: string; workspace_slug: string | null }>(
      "select * from public.accept_workspace_invitation_by_id($1)",
      [invitationId]
    )
  )
  return rows[0]
}

const acceptByToken = async (userId: string, tokenHash: string) => {
  const { rows } = await db.asUser(userId, (tx) =>
    tx.query<{ outcome: string; workspace_slug: string | null }>(
      "select * from public.accept_workspace_invitation($1)",
      [tokenHash]
    )
  )
  return rows[0]
}

const membershipsOf = async (userId: string) => {
  const { rows } = await db.admin.query<{ workspace_id: string; role: string }>(
    "select workspace_id, role from public.workspace_members where user_id = $1 order by workspace_id",
    [userId]
  )
  return rows
}

describe("listing my pending invitations", () => {
  let t: Setup
  beforeAll(async () => {
    t = await f.setup()
  })

  it("lists every open invitation for my verified email, with display fields only", async () => {
    const email = f.uniqueEmail("multi")
    const invitee = await db.createUser(email)
    const toAgency = await f.invite(t.agencyOwner, t.agency.id, email, "admin")
    const toClient = await f.invite(t.clientOwner, t.clientA.id, email, "member")

    const rows = await pendingFor(invitee)
    expect(rows.map((row) => row.invitation_id).sort()).toEqual([toAgency.id, toClient.id].sort())
    const agencyRow = rows.find((row) => row.invitation_id === toAgency.id)
    expect(agencyRow).toMatchObject({
      workspace_name: t.agency.name,
      role: "admin",
      inviter_name: "Ada Owner",
    })
    expect(Object.keys(agencyRow ?? {}).sort()).toEqual(
      ["created_at", "expires_at", "invitation_id", "inviter_name", "role", "workspace_name"].sort()
    )
    const everything = JSON.stringify(rows)
    expect(everything).not.toContain(toAgency.tokenHash)
    expect(everything).not.toContain(toClient.tokenHash)
  })

  it("matches the address case- and space-insensitively, like invitations are stored", async () => {
    const email = f.uniqueEmail("mixed")
    const invitee = await db.createUser(email.toUpperCase())
    const invitation = await f.invite(t.agencyOwner, t.agency.id, email)
    expect((await pendingFor(invitee)).map((row) => row.invitation_id)).toEqual([invitation.id])
  })

  it("shows nothing for an unverified address", async () => {
    const email = f.uniqueEmail("unverified")
    const invitee = await db.createUser(email, {}, { confirmed: false })
    const invitation = await f.invite(t.agencyOwner, t.agency.id, email)
    expect(await pendingFor(invitee)).toEqual([])
    expect(await acceptById(invitee, invitation.id)).toEqual({
      outcome: "email_unverified",
      workspace_slug: null,
    })
    expect(await membershipsOf(invitee)).toEqual([])
  })

  it("leaves out expired, revoked and accepted invitations", async () => {
    const email = f.uniqueEmail("closed")
    const invitee = await db.createUser(email)
    const expired = await f.invite(t.agencyOwner, t.agency.id, email)
    await db.admin.query(
      "update public.workspace_invitations set expires_at = now() - interval '1 minute' where id = $1",
      [expired.id]
    )
    const revoked = await f.invite(t.agencyOwner, t.clientA.id, email)
    await db.asUser(t.agencyOwner, (tx) =>
      tx.query("select public.revoke_workspace_invitation($1, $2)", [t.clientA.id, revoked.id])
    )
    const accepted = await f.invite(t.agencyOwner, t.clientB.id, email)
    await acceptByToken(invitee, accepted.tokenHash)

    expect(await pendingFor(invitee)).toEqual([])
  })

  it("never shows anyone else's invitations", async () => {
    const email = f.uniqueEmail("someone")
    await f.invite(t.agencyOwner, t.agency.id, email)
    expect(await pendingFor(t.outsider)).toEqual([])
    expect(await pendingFor(t.agencyOwner)).toEqual([])
  })

  it("is for signed-in users only", async () => {
    const call = (fn: (tx: Tx) => Promise<unknown>) => db.asAnon(fn)
    await expect(
      call((tx) => tx.query("select * from public.list_my_pending_invitations()"))
    ).rejects.toThrow(/permission denied/)
    await expect(
      call((tx) =>
        tx.query("select * from public.accept_workspace_invitation_by_id($1)", [
          crypto.randomUUID(),
        ])
      )
    ).rejects.toThrow(/permission denied/)
  })
})

describe("accepting by id", () => {
  let t: Setup
  beforeAll(async () => {
    t = await f.setup()
  })

  it("joins exactly the invited workspace with the invited role, then drops off the list", async () => {
    const email = f.uniqueEmail("joiner")
    const invitee = await db.createUser(email)
    const invitation = await f.invite(t.agencyOwner, t.clientA.id, email, "admin")

    expect(await acceptById(invitee, invitation.id)).toEqual({
      outcome: "accepted",
      workspace_slug: t.clientA.slug,
    })
    expect(await membershipsOf(invitee)).toEqual([{ workspace_id: t.clientA.id, role: "admin" }])
    expect(await f.visibleWorkspaceIds(invitee)).toEqual([t.clientA.id])
    expect(await pendingFor(invitee)).toEqual([])

    const accepted = (await f.auditEvents(t.clientA.id)).find(
      (event) =>
        event.event_type === "workspace.invitation_accepted" && event.actor_user_id === invitee
    )
    expect(accepted?.metadata).toMatchObject({ method: "pending_list", role: "admin" })

    // Accepting again is harmless for the same person.
    expect((await acceptById(invitee, invitation.id))?.outcome).toBe("accepted")
  })

  it("refuses a different signed-in user without revealing anything", async () => {
    const email = f.uniqueEmail("target")
    await db.createUser(email)
    const invitation = await f.invite(t.agencyOwner, t.agency.id, email)
    for (const intruder of [t.outsider, t.agencyMember, t.otherOwner]) {
      expect(await acceptById(intruder, invitation.id)).toEqual({
        outcome: "invalid",
        workspace_slug: null,
      })
    }
    const { rows } = await db.admin.query<{ accepted_at: string | null }>(
      "select accepted_at from public.workspace_invitations where id = $1",
      [invitation.id]
    )
    expect(rows[0]?.accepted_at).toBeNull()
    expect(await membershipsOf(t.outsider)).toEqual([])
  })

  it("refuses expired, revoked and someone-else's-used invitations", async () => {
    const email = f.uniqueEmail("states")
    const invitee = await db.createUser(email)
    const expired = await f.invite(t.agencyOwner, t.clientA.id, email)
    await db.admin.query(
      "update public.workspace_invitations set expires_at = now() - interval '1 minute' where id = $1",
      [expired.id]
    )
    const revoked = await f.invite(t.agencyOwner, t.clientB.id, email)
    await db.asUser(t.agencyOwner, (tx) =>
      tx.query("select public.revoke_workspace_invitation($1, $2)", [t.clientB.id, revoked.id])
    )

    expect((await acceptById(invitee, expired.id))?.outcome).toBe("expired")
    expect((await acceptById(invitee, revoked.id))?.outcome).toBe("revoked")
    expect((await acceptById(invitee, crypto.randomUUID()))?.outcome).toBe("invalid")
    expect(await membershipsOf(invitee)).toEqual([])
  })

  it("handles several invitations independently", async () => {
    const email = f.uniqueEmail("several")
    const invitee = await db.createUser(email)
    const first = await f.invite(t.agencyOwner, t.clientA.id, email)
    const second = await f.invite(t.agencyOwner, t.clientB.id, email, "admin")

    await acceptById(invitee, first.id)
    expect((await pendingFor(invitee)).map((row) => row.invitation_id)).toEqual([second.id])
    await acceptById(invitee, second.id)
    expect(await membershipsOf(invitee)).toEqual(
      [
        { workspace_id: t.clientA.id, role: "member" },
        { workspace_id: t.clientB.id, role: "admin" },
      ].sort((a, b) => a.workspace_id.localeCompare(b.workspace_id))
    )
  })

  it("shares one core with the token path: a link accepted invitation is 'accepted' by id too", async () => {
    const email = f.uniqueEmail("shared")
    const invitee = await db.createUser(email)
    const invitation = await f.invite(t.agencyOwner, t.agency.id, email)
    expect((await acceptByToken(invitee, invitation.tokenHash))?.outcome).toBe("accepted")
    expect((await acceptById(invitee, invitation.id))?.outcome).toBe("accepted")
    expect(await membershipsOf(invitee)).toEqual([{ workspace_id: t.agency.id, role: "member" }])
  })

  it("the token path still refuses a rotated (resent) token", async () => {
    const email = f.uniqueEmail("rotated")
    const invitee = await db.createUser(email)
    const invitation = await f.invite(t.agencyOwner, t.agency.id, email)
    await db.asUser(t.agencyOwner, (tx) =>
      tx.query("select * from public.resend_workspace_invitation($1, $2, $3)", [
        t.agency.id,
        invitation.id,
        f.newTokenHash(),
      ])
    )
    expect((await acceptByToken(invitee, invitation.tokenHash))?.outcome).toBe("invalid")
    expect(await membershipsOf(invitee)).toEqual([])
  })
})
