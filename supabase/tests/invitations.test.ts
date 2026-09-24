import { createHash, randomBytes } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createTestDb, type TestDb, type Tx } from "./helpers/test-db"

/**
 * Workspace invitations (Sprint 3): who can create, read, resend and revoke
 * them; how acceptance is bound to the invited, verified email and to exactly
 * one workspace; and the tokens' lifecycle. Numbered tests map to the Sprint 3
 * minimum list in docs/QA.md. Real concurrency (two requests at once) is
 * covered against the local stack in e2e/invitations-api.spec.ts.
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
/** What the app does: a random 256-bit token, stored only as its SHA-256. */
const newTokenHash = () =>
  createHash("sha256").update(randomBytes(32).toString("base64url")).digest("hex")

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

async function createClient(userId: string, agencyId: string, name: string) {
  const { rows } = await db.asUser(userId, (tx) =>
    tx.query<{ id: string; slug: string }>(
      "select id, slug from public.create_client_workspace(p_agency_id => $1, p_name => $2)",
      [agencyId, name]
    )
  )
  const row = rows[0]
  if (!row) throw new Error("create_client_workspace returned no row")
  return row
}

async function addMember(workspaceId: string, userId: string, role: Role) {
  // Fixture shortcut (trusted); the product path is an accepted invitation.
  await db.admin.query(
    "insert into public.workspace_members (workspace_id, user_id, role) values ($1, $2, $3)",
    [workspaceId, userId, role]
  )
}

type Created = { outcome: string; invitation_id: string | null; invitation_expires_at: string }

async function invite(
  userId: string,
  workspaceId: string,
  email: string,
  role: Role = "member",
  tokenHash = newTokenHash(),
  message: string | null = null
) {
  const { rows } = await db.asUser(userId, (tx) =>
    tx.query<Created>("select * from public.create_workspace_invitation($1, $2, $3, $4, $5)", [
      workspaceId,
      email,
      role,
      tokenHash,
      message,
    ])
  )
  const row = rows[0]
  if (!row) throw new Error("create_workspace_invitation returned no row")
  return { ...row, tokenHash }
}

async function accept(userId: string, tokenHash: string) {
  const { rows } = await db.asUser(userId, (tx) =>
    tx.query<{ outcome: string; workspace_slug: string | null }>(
      "select * from public.accept_workspace_invitation($1)",
      [tokenHash]
    )
  )
  return rows[0]
}

async function preview(tokenHash: string, userId?: string) {
  const query = (tx: Tx) =>
    tx.query<Record<string, unknown>>("select * from public.get_workspace_invitation($1)", [
      tokenHash,
    ])
  const { rows } = userId ? await db.asUser(userId, query) : await db.asAnon(query)
  return rows
}

async function invitationRow(id: string) {
  const { rows } = await db.admin.query<{
    token_hash: string
    role: Role
    expires_at: Date
    accepted_at: Date | null
    accepted_by: string | null
    revoked_at: Date | null
    delivery_status: string
    last_message_id: string | null
  }>("select * from public.workspace_invitations where id = $1", [id])
  const row = rows[0]
  if (!row) throw new Error(`No invitation ${id}`)
  return row
}

async function memberships(userId: string) {
  const { rows } = await db.admin.query<{ workspace_id: string; role: Role }>(
    "select workspace_id, role from public.workspace_members where user_id = $1 order by workspace_id",
    [userId]
  )
  return rows
}

async function visibleWorkspaceIds(userId: string) {
  const { rows } = await db.asUser(userId, (tx) =>
    tx.query<{ id: string }>("select id from public.workspaces")
  )
  return rows.map((row) => row.id).sort()
}

async function expire(invitationId: string) {
  await db.admin.query(
    "update public.workspace_invitations set expires_at = now() - interval '1 minute' where id = $1",
    [invitationId]
  )
}

/**
 * An agency (owner, admin, member) with clients A and B, and a second,
 * unrelated agency with its own client.
 */
async function setup() {
  const agencyOwner = await db.createUser(uniqueEmail("agency-owner"))
  const agencyAdmin = await db.createUser(uniqueEmail("agency-admin"))
  const agencyMember = await db.createUser(uniqueEmail("agency-member"))
  const otherOwner = await db.createUser(uniqueEmail("other-owner"))

  const agency = await createAgency(agencyOwner, "Agency")
  await addMember(agency.id, agencyAdmin, "admin")
  await addMember(agency.id, agencyMember, "member")
  const clientA = await createClient(agencyOwner, agency.id, `Client A ${sequence}`)
  const clientB = await createClient(agencyOwner, agency.id, `Client B ${sequence}`)

  const otherAgency = await createAgency(otherOwner, "Other agency")
  const otherClient = await createClient(otherOwner, otherAgency.id, `Other client ${sequence}`)

  return {
    agencyOwner,
    agencyAdmin,
    agencyMember,
    otherOwner,
    agency,
    clientA,
    clientB,
    otherAgency,
    otherClient,
  }
}

type Setup = Awaited<ReturnType<typeof setup>>

describe("creating invitations", () => {
  let t: Setup
  beforeAll(async () => {
    t = await setup()
  })

  it("1. lets an agency owner invite to their own workspace", async () => {
    const email = uniqueEmail("new-hire")
    const created = await invite(t.agencyOwner, t.agency.id, email, "admin")
    expect(created.outcome).toBe("created")
    expect(created.invitation_id).toMatch(/^[0-9a-f-]{36}$/)

    const row = await invitationRow(created.invitation_id!)
    expect(row.role).toBe("admin")
    // Only the hash is stored, exactly as the app computed it.
    expect(row.token_hash).toBe(created.tokenHash)
    expect(row.delivery_status).toBe("pending")
    // Seven days from now.
    const days = (row.expires_at.getTime() - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(6.99)
    expect(days).toBeLessThanOrEqual(7)
  })

  it("2. lets an agency admin invite, as member or admin, to the agency and its clients", async () => {
    for (const [workspaceId, role] of [
      [t.agency.id, "member"],
      [t.agency.id, "admin"],
      [t.clientA.id, "admin"],
    ] as const) {
      const created = await invite(t.agencyAdmin, workspaceId, uniqueEmail("by-admin"), role)
      expect(created.outcome).toBe("created")
    }
  })

  it("3. refuses a plain member, in the agency and in its clients", async () => {
    for (const workspaceId of [t.agency.id, t.clientA.id]) {
      await expect(
        invite(t.agencyMember, workspaceId, uniqueEmail("by-member"))
      ).rejects.toMatchObject({ code: "42501" })
    }
  })

  it("4. refuses anyone outside the workspace, including other agencies' owners", async () => {
    await expect(invite(t.otherOwner, t.agency.id, uniqueEmail("x"))).rejects.toMatchObject({
      code: "42501",
    })
    await expect(invite(t.otherOwner, t.clientA.id, uniqueEmail("x"))).rejects.toMatchObject({
      code: "42501",
    })
    // ...and the agency's owner can't reach the other agency's client.
    await expect(invite(t.agencyOwner, t.otherClient.id, uniqueEmail("x"))).rejects.toMatchObject({
      code: "42501",
    })
    // A made-up workspace looks exactly the same.
    await expect(
      invite(t.agencyOwner, "00000000-0000-4000-8000-000000000000", uniqueEmail("x"))
    ).rejects.toMatchObject({ code: "42501" })
  })

  it("never grants ownership by invitation", async () => {
    await expect(
      invite(t.agencyOwner, t.agency.id, uniqueEmail("would-be-owner"), "owner")
    ).rejects.toMatchObject({ code: "22023" })
    // The table refuses it too, whoever writes.
    await expect(
      db.admin.query(
        `insert into public.workspace_invitations (workspace_id, email, role, token_hash, expires_at)
         values ($1, 'owner@example.test', 'owner', $2, now() + interval '1 day')`,
        [t.agency.id, newTokenHash()]
      )
    ).rejects.toThrow(/workspace_invitations_role_check/)
  })

  it("normalises the address and rejects malformed ones and malformed hashes", async () => {
    const email = uniqueEmail("Mixed.Case")
    const created = await invite(t.agencyOwner, t.agency.id, `  ${email.toUpperCase()} `)
    const { rows } = await db.admin.query<{ email: string }>(
      "select email from public.workspace_invitations where id = $1",
      [created.invitation_id]
    )
    expect(rows[0]?.email).toBe(email.toLowerCase())

    await expect(invite(t.agencyOwner, t.agency.id, "not-an-email")).rejects.toThrow(
      /workspace_invitations_email_check/
    )
    await expect(
      invite(t.agencyOwner, t.agency.id, uniqueEmail("raw-token"), "member", "raw-token-value")
    ).rejects.toThrow(/workspace_invitations_token_hash_check/)
  })

  it("keeps one open invitation per address: a second invite reports the pending one", async () => {
    const email = uniqueEmail("twice")
    const first = await invite(t.agencyOwner, t.agency.id, email)
    const second = await invite(t.agencyAdmin, t.agency.id, email.toUpperCase())
    expect(second.outcome).toBe("already_pending")
    expect(second.invitation_id).toBe(first.invitation_id)

    const { rows } = await db.admin.query(
      "select id from public.workspace_invitations where workspace_id = $1 and email = $2",
      [t.agency.id, email]
    )
    expect(rows).toHaveLength(1)
    // The second call's token was never stored: only the first link works.
    expect(await preview(second.tokenHash)).toHaveLength(0)
  })

  it("the partial unique index holds even for direct writes", async () => {
    const email = uniqueEmail("index")
    await invite(t.agencyOwner, t.agency.id, email)
    await expect(
      db.admin.query(
        `insert into public.workspace_invitations (workspace_id, email, role, token_hash, expires_at)
         values ($1, $2, 'member', $3, now() + interval '1 day')`,
        [t.agency.id, email, newTokenHash()]
      )
    ).rejects.toThrow(/workspace_invitations_open_email_key/)
  })

  it("reports existing members instead of inviting them (case-insensitively)", async () => {
    const adminEmail = (
      await db.admin.query<{ email: string }>("select email from public.profiles where id = $1", [
        t.agencyAdmin,
      ])
    ).rows[0]?.email
    const created = await invite(t.agencyOwner, t.agency.id, ` ${adminEmail?.toUpperCase()}`)
    expect(created.outcome).toBe("already_member")
    expect(created.invitation_id).toBeNull()
  })

  it("reissues an expired invitation on the same row with a new token", async () => {
    const email = uniqueEmail("expired")
    const first = await invite(t.agencyOwner, t.agency.id, email, "member")
    await expire(first.invitation_id!)

    const again = await invite(t.agencyOwner, t.agency.id, email, "admin")
    expect(again.outcome).toBe("created")
    expect(again.invitation_id).toBe(first.invitation_id)

    const row = await invitationRow(first.invitation_id!)
    expect(row.token_hash).toBe(again.tokenHash)
    expect(row.role).toBe("admin")
    expect(row.expires_at.getTime()).toBeGreaterThan(Date.now())
    expect(await preview(first.tokenHash)).toHaveLength(0)
  })
})

describe("reading invitations", () => {
  let t: Setup
  let agencyInvitation: string
  let clientInvitation: string
  beforeAll(async () => {
    t = await setup()
    agencyInvitation = (await invite(t.agencyOwner, t.agency.id, uniqueEmail("agency-invitee")))
      .invitation_id!
    clientInvitation = (await invite(t.agencyOwner, t.clientA.id, uniqueEmail("client-invitee")))
      .invitation_id!
  })

  const visibleInvitations = async (userId: string) => {
    const { rows } = await db.asUser(userId, (tx) =>
      tx.query<{ id: string }>("select id from public.workspace_invitations")
    )
    return rows.map((row) => row.id)
  }

  it("shows owners and admins their workspaces' invitations, including inherited clients", async () => {
    expect(await visibleInvitations(t.agencyOwner)).toEqual(
      expect.arrayContaining([agencyInvitation, clientInvitation])
    )
    expect(await visibleInvitations(t.agencyAdmin)).toEqual(
      expect.arrayContaining([agencyInvitation, clientInvitation])
    )
  })

  it("hides them from plain members", async () => {
    expect(await visibleInvitations(t.agencyMember)).toEqual([])
  })

  it("5. hides them from other tenants", async () => {
    expect(await visibleInvitations(t.otherOwner)).toEqual([])
  })

  it("never exposes the token hash, even to owners", async () => {
    await expect(
      db.asUser(t.agencyOwner, (tx) =>
        tx.query("select token_hash from public.workspace_invitations")
      )
    ).rejects.toThrow(/permission denied/)
  })

  it("15. denies anon entirely", async () => {
    await expect(
      db.asAnon((tx) => tx.query("select id from public.workspace_invitations"))
    ).rejects.toThrow(/permission denied/)
  })
})

describe("writing invitations directly is impossible", () => {
  let t: Setup
  let invitationId: string
  beforeAll(async () => {
    t = await setup()
    invitationId = (await invite(t.agencyOwner, t.agency.id, uniqueEmail("target"))).invitation_id!
  })

  it("16. anon can't insert invitation rows", async () => {
    await expect(
      db.asAnon((tx) =>
        tx.query(
          `insert into public.workspace_invitations (workspace_id, email, role, token_hash, expires_at)
           values ($1, 'anon@example.test', 'admin', $2, now() + interval '1 day')`,
          [t.agency.id, newTokenHash()]
        )
      )
    ).rejects.toThrow(/permission denied/)
  })

  it("owners can't insert, update or delete rows directly either", async () => {
    await expect(
      db.asUser(t.agencyOwner, (tx) =>
        tx.query(
          `insert into public.workspace_invitations (workspace_id, email, role, token_hash, expires_at)
           values ($1, 'direct@example.test', 'admin', $2, now() + interval '1 day')`,
          [t.agency.id, newTokenHash()]
        )
      )
    ).rejects.toThrow(/permission denied/)
    await expect(
      db.asUser(t.agencyOwner, (tx) =>
        tx.query("update public.workspace_invitations set role = 'admin' where id = $1", [
          invitationId,
        ])
      )
    ).rejects.toThrow(/permission denied/)
    await expect(
      db.asUser(t.agencyOwner, (tx) =>
        tx.query("delete from public.workspace_invitations where id = $1", [invitationId])
      )
    ).rejects.toThrow(/permission denied/)
  })

  it("7. outsiders can't modify another tenant's invitation through the functions", async () => {
    // Naming the victim workspace: refused outright.
    await expect(
      db.asUser(t.otherOwner, (tx) =>
        tx.query("select * from public.resend_workspace_invitation($1, $2, $3)", [
          t.agency.id,
          invitationId,
          newTokenHash(),
        ])
      )
    ).rejects.toMatchObject({ code: "42501" })
    // Naming their own workspace: the invitation isn't in it.
    const { rows } = await db.asUser(t.otherOwner, (tx) =>
      tx.query<{ outcome: string }>(
        "select * from public.resend_workspace_invitation($1, $2, $3)",
        [t.otherAgency.id, invitationId, newTokenHash()]
      )
    )
    expect(rows[0]?.outcome).toBe("not_found")
    // Delivery bookkeeping for someone else's invitation changes nothing.
    const before = await invitationRow(invitationId)
    await db.asUser(t.otherOwner, (tx) =>
      tx.query("select public.record_workspace_invitation_delivery($1, $2, true, 'forged')", [
        invitationId,
        before.token_hash,
      ])
    )
    const after = await invitationRow(invitationId)
    expect(after.delivery_status).toBe("pending")
    expect(after.token_hash).toBe(before.token_hash)
  })

  it("6. outsiders and plain members can't revoke it", async () => {
    await expect(
      db.asUser(t.otherOwner, (tx) =>
        tx.query("select public.revoke_workspace_invitation($1, $2)", [t.agency.id, invitationId])
      )
    ).rejects.toMatchObject({ code: "42501" })
    const { rows } = await db.asUser(t.otherOwner, (tx) =>
      tx.query<{ outcome: string }>(
        "select public.revoke_workspace_invitation($1, $2) as outcome",
        [t.otherAgency.id, invitationId]
      )
    )
    expect(rows[0]?.outcome).toBe("not_found")
    await expect(
      db.asUser(t.agencyMember, (tx) =>
        tx.query("select public.revoke_workspace_invitation($1, $2)", [t.agency.id, invitationId])
      )
    ).rejects.toMatchObject({ code: "42501" })
    expect((await invitationRow(invitationId)).revoked_at).toBeNull()
  })

  it("17. nobody can create memberships directly, anon or signed in", async () => {
    const stranger = await db.createUser(uniqueEmail("stranger"))
    await expect(
      db.asAnon((tx) =>
        tx.query(
          "insert into public.workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')",
          [t.agency.id, stranger]
        )
      )
    ).rejects.toThrow(/permission denied/)
    await expect(
      db.asUser(t.agencyOwner, (tx) =>
        tx.query(
          "insert into public.workspace_members (workspace_id, user_id, role) values ($1, $2, 'member')",
          [t.agency.id, stranger]
        )
      )
    ).rejects.toThrow(/permission denied/)
  })
})

describe("resending, revoking and delivery", () => {
  let t: Setup
  beforeAll(async () => {
    t = await setup()
  })

  const resend = async (userId: string, workspaceId: string, invitationId: string) => {
    const tokenHash = newTokenHash()
    const { rows } = await db.asUser(userId, (tx) =>
      tx.query<{ outcome: string; invitation_email: string | null }>(
        "select * from public.resend_workspace_invitation($1, $2, $3)",
        [workspaceId, invitationId, tokenHash]
      )
    )
    return { ...rows[0], tokenHash }
  }

  it("resending rotates the token: the old link stops working, the new one works", async () => {
    const email = uniqueEmail("resend")
    const invitee = await db.createUser(email)
    const first = await invite(t.agencyOwner, t.clientA.id, email)
    await db.admin.query(
      "update public.workspace_invitations set expires_at = now() + interval '1 hour' where id = $1",
      [first.invitation_id]
    )

    const resent = await resend(t.agencyAdmin, t.clientA.id, first.invitation_id!)
    expect(resent.outcome).toBe("resent")
    expect(resent.invitation_email).toBe(email)

    const row = await invitationRow(first.invitation_id!)
    expect(row.token_hash).toBe(resent.tokenHash)
    expect((row.expires_at.getTime() - Date.now()) / 86_400_000).toBeGreaterThan(6.99)

    expect(await preview(first.tokenHash)).toHaveLength(0)
    expect((await accept(invitee, first.tokenHash))?.outcome).toBe("invalid")
    expect((await accept(invitee, resent.tokenHash))?.outcome).toBe("accepted")
  })

  it("revoking is idempotent, keeps the row, and kills the link", async () => {
    const email = uniqueEmail("revoke")
    const invitee = await db.createUser(email)
    const created = await invite(t.agencyOwner, t.agency.id, email)
    const revoke = () =>
      db.asUser(t.agencyAdmin, (tx) =>
        tx.query<{ outcome: string }>(
          "select public.revoke_workspace_invitation($1, $2) as outcome",
          [t.agency.id, created.invitation_id]
        )
      )
    expect((await revoke()).rows[0]?.outcome).toBe("revoked")
    expect((await revoke()).rows[0]?.outcome).toBe("revoked")

    expect((await invitationRow(created.invitation_id!)).revoked_at).not.toBeNull()
    expect((await preview(created.tokenHash))[0]?.status).toBe("revoked")
    // 11. A revoked invitation can't be accepted.
    expect((await accept(invitee, created.tokenHash))?.outcome).toBe("revoked")
    expect(await memberships(invitee)).toEqual([])
    // Resending it is refused too.
    expect((await resend(t.agencyOwner, t.agency.id, created.invitation_id!)).outcome).toBe(
      "revoked"
    )
  })

  it("records delivery only for the current token", async () => {
    const created = await invite(t.agencyOwner, t.agency.id, uniqueEmail("delivery"))
    const record = (tokenHash: string, delivered: boolean, messageId: string | null) =>
      db.asUser(t.agencyOwner, (tx) =>
        tx.query("select public.record_workspace_invitation_delivery($1, $2, $3, $4)", [
          created.invitation_id,
          tokenHash,
          delivered,
          messageId,
        ])
      )

    await record(created.tokenHash, false, null)
    expect((await invitationRow(created.invitation_id!)).delivery_status).toBe("failed")

    await record(created.tokenHash, true, "provider-message-1")
    let row = await invitationRow(created.invitation_id!)
    expect(row.delivery_status).toBe("sent")
    expect(row.last_message_id).toBe("provider-message-1")

    // A late result for a superseded token doesn't overwrite the current state.
    const resent = await resend(t.agencyOwner, t.agency.id, created.invitation_id!)
    await record(created.tokenHash, true, "stale")
    row = await invitationRow(created.invitation_id!)
    expect(row.delivery_status).toBe("pending")
    expect(row.last_message_id).toBeNull()
    await record(resent.tokenHash, true, "provider-message-2")
    expect((await invitationRow(created.invitation_id!)).last_message_id).toBe("provider-message-2")
  })

  it("counts open, unexpired invitations for admins (client list)", async () => {
    const client = await createClient(t.agencyOwner, t.agency.id, `Counted ${sequence}`)
    await invite(t.agencyOwner, client.id, uniqueEmail("count-1"))
    const expired = await invite(t.agencyOwner, client.id, uniqueEmail("count-2"))
    await expire(expired.invitation_id!)
    const count = async (userId: string) =>
      (
        await db.asUser(userId, (tx) =>
          tx.query<{ n: number }>(
            "select public.pending_invitation_count(w) as n from public.workspaces w where w.id = $1",
            [client.id]
          )
        )
      ).rows[0]?.n
    expect(await count(t.agencyAdmin)).toBe(1)
  })
})

describe("the public invitation preview", () => {
  let t: Setup
  beforeAll(async () => {
    t = await setup()
    await db.admin.query("update public.profiles set full_name = 'Olivia Owner' where id = $1", [
      t.agencyOwner,
    ])
  })

  it("shows the invitee what they're joining, before sign-in, without ids", async () => {
    const email = uniqueEmail("preview")
    const created = await invite(t.agencyOwner, t.clientA.id, email, "admin")
    const rows = await preview(created.tokenHash)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      status: "pending",
      email,
      role: "admin",
      inviter_name: "Olivia Owner",
      workspace_slug: null,
    })
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual(
      [
        "email",
        "expires_at",
        "inviter_name",
        "role",
        "status",
        "workspace_name",
        "workspace_slug",
      ].sort()
    )
    expect(JSON.stringify(rows)).not.toContain(t.clientA.id)
  })

  it("returns nothing for unknown, random or malformed tokens", async () => {
    expect(await preview(newTokenHash())).toHaveLength(0)
    expect(await preview("not-a-hash")).toHaveLength(0)
    expect(await preview("")).toHaveLength(0)
  })

  it("reports expired invitations as expired", async () => {
    const created = await invite(t.agencyOwner, t.agency.id, uniqueEmail("preview-expired"))
    await expire(created.invitation_id!)
    expect((await preview(created.tokenHash))[0]?.status).toBe("expired")
  })

  it("gives the workspace URL only to the person who accepted it", async () => {
    const email = uniqueEmail("preview-accepted")
    const invitee = await db.createUser(email)
    const created = await invite(t.agencyOwner, t.clientA.id, email)
    await accept(invitee, created.tokenHash)

    expect((await preview(created.tokenHash, invitee))[0]).toMatchObject({
      status: "accepted",
      workspace_slug: t.clientA.slug,
    })
    expect((await preview(created.tokenHash))[0]).toMatchObject({
      status: "accepted",
      workspace_slug: null,
    })
    expect((await preview(created.tokenHash, t.otherOwner))[0]?.workspace_slug).toBeNull()
  })
})

describe("accepting invitations", () => {
  let t: Setup
  beforeAll(async () => {
    t = await setup()
  })

  it("8. adds the invitee to exactly the invited workspace, with the invited role", async () => {
    const email = uniqueEmail("joiner")
    const invitee = await db.createUser(email)
    const inviteeHome = await createAgency(invitee, "Joiner's own")
    const created = await invite(t.agencyAdmin, t.clientA.id, email, "admin")

    expect(await accept(invitee, created.tokenHash)).toEqual({
      outcome: "accepted",
      workspace_slug: t.clientA.slug,
    })
    expect(await memberships(invitee)).toEqual(
      expect.arrayContaining([
        { workspace_id: t.clientA.id, role: "admin" },
        { workspace_id: inviteeHome.id, role: "owner" },
      ])
    )
    expect(await memberships(invitee)).toHaveLength(2)
    // Siblings, the agency and other tenants stay invisible.
    expect(await visibleWorkspaceIds(invitee)).toEqual([t.clientA.id, inviteeHome.id].sort())

    const row = await invitationRow(created.invitation_id!)
    expect(row.accepted_at).not.toBeNull()
    expect(row.accepted_by).toBe(invitee)
  })

  it("9. refuses a signed-in user with a different email, and leaves the invitation open", async () => {
    const email = uniqueEmail("alice")
    await db.createUser(email)
    const bob = await db.createUser(uniqueEmail("bob"))
    const created = await invite(t.agencyOwner, t.agency.id, email)

    expect((await accept(bob, created.tokenHash))?.outcome).toBe("email_mismatch")
    expect(await memberships(bob)).toEqual([])
    const row = await invitationRow(created.invitation_id!)
    expect(row.accepted_at).toBeNull()
    // Even the agency's own owner can't take someone else's invitation.
    expect((await accept(t.agencyOwner, created.tokenHash))?.outcome).toBe("email_mismatch")
  })

  it("matches the email case-insensitively", async () => {
    const email = uniqueEmail("case")
    const invitee = await db.createUser(email.toUpperCase())
    const created = await invite(t.agencyOwner, t.agency.id, email)
    expect((await accept(invitee, created.tokenHash))?.outcome).toBe("accepted")
  })

  it("requires a confirmed email address", async () => {
    const email = uniqueEmail("unconfirmed")
    const invitee = await db.createUser(email, {}, { confirmed: false })
    const created = await invite(t.agencyOwner, t.agency.id, email)
    expect((await accept(invitee, created.tokenHash))?.outcome).toBe("email_unverified")
    expect(await memberships(invitee)).toEqual([])
  })

  it("10. refuses an expired invitation", async () => {
    const email = uniqueEmail("late")
    const invitee = await db.createUser(email)
    const created = await invite(t.agencyOwner, t.agency.id, email)
    await expire(created.invitation_id!)
    expect((await accept(invitee, created.tokenHash))?.outcome).toBe("expired")
    expect(await memberships(invitee)).toEqual([])
  })

  it("12–13. can't be reused: accepting twice keeps one membership", async () => {
    const email = uniqueEmail("twice")
    const invitee = await db.createUser(email)
    const created = await invite(t.agencyOwner, t.clientB.id, email)

    expect((await accept(invitee, created.tokenHash))?.outcome).toBe("accepted")
    // The same person again (a second tab, a double click): same answer, no duplicate.
    expect(await accept(invitee, created.tokenHash)).toEqual({
      outcome: "accepted",
      workspace_slug: t.clientB.slug,
    })
    expect(await memberships(invitee)).toEqual([{ workspace_id: t.clientB.id, role: "member" }])

    // Anyone else presenting the used token gets nothing.
    const stranger = await db.createUser(uniqueEmail("stranger"))
    expect((await accept(stranger, created.tokenHash))?.outcome).toBe("already_used")
    expect(await memberships(stranger)).toEqual([])
  })

  it("keeps an existing member's role and closes the invitation", async () => {
    const email = uniqueEmail("existing")
    const invitee = await db.createUser(email)
    const created = await invite(t.agencyOwner, t.clientA.id, email, "admin")
    // They joined some other way before accepting.
    await addMember(t.clientA.id, invitee, "member")

    expect((await accept(invitee, created.tokenHash))?.outcome).toBe("already_member")
    expect(await memberships(invitee)).toEqual([{ workspace_id: t.clientA.id, role: "member" }])
    expect((await invitationRow(created.invitation_id!)).accepted_at).not.toBeNull()
  })

  it("treats random and malformed tokens as invalid", async () => {
    const someone = await db.createUser(uniqueEmail("prober"))
    expect((await accept(someone, newTokenHash()))?.outcome).toBe("invalid")
    expect((await accept(someone, "' or 1=1 --"))?.outcome).toBe("invalid")
    expect(await memberships(someone)).toEqual([])
  })

  it("requires a signed-in user: anon can't call it at all", async () => {
    const created = await invite(t.agencyOwner, t.agency.id, uniqueEmail("anon-accept"))
    await expect(
      db.asAnon((tx) =>
        tx.query("select * from public.accept_workspace_invitation($1)", [created.tokenHash])
      )
    ).rejects.toThrow(/permission denied/)
  })
})

describe("14. last-owner protection still holds alongside invitations and auditing", () => {
  let t: Setup
  beforeAll(async () => {
    t = await setup()
  })

  it("blocks removing or demoting the last owner, even by themselves", async () => {
    await expect(
      db.asUser(t.agencyOwner, (tx) =>
        tx.query("delete from public.workspace_members where workspace_id = $1 and user_id = $2", [
          t.agency.id,
          t.agencyOwner,
        ])
      )
    ).rejects.toThrow(/at least one owner/)
    await expect(
      db.asUser(t.agencyOwner, (tx) =>
        tx.query(
          "update public.workspace_members set role = 'admin' where workspace_id = $1 and user_id = $2",
          [t.agency.id, t.agencyOwner]
        )
      )
    ).rejects.toThrow(/at least one owner/)
  })

  it("lets owners demote and remove a co-owner who isn't the last one", async () => {
    const coOwner = await db.createUser(uniqueEmail("co-owner"))
    await addMember(t.agency.id, coOwner, "owner")
    await db.asUser(t.agencyOwner, (tx) =>
      tx.query(
        "update public.workspace_members set role = 'admin' where workspace_id = $1 and user_id = $2",
        [t.agency.id, coOwner]
      )
    )
    expect(await memberships(coOwner)).toEqual([{ workspace_id: t.agency.id, role: "admin" }])
    await db.asUser(t.agencyOwner, (tx) =>
      tx.query("delete from public.workspace_members where workspace_id = $1 and user_id = $2", [
        t.agency.id,
        coOwner,
      ])
    )
    expect(await memberships(coOwner)).toEqual([])
    // The workspace still has its owner.
    const { rows } = await db.admin.query(
      "select 1 from public.workspace_members where workspace_id = $1 and role = 'owner'",
      [t.agency.id]
    )
    expect(rows).toHaveLength(1)
  })

  it("admins can't demote or remove owners (0 rows), and can manage members", async () => {
    const demote = await db.asUser(t.agencyAdmin, (tx) =>
      tx.query(
        "update public.workspace_members set role = 'member' where workspace_id = $1 and user_id = $2",
        [t.agency.id, t.agencyOwner]
      )
    )
    expect(demote.affectedRows).toBe(0)
    const remove = await db.asUser(t.agencyAdmin, (tx) =>
      tx.query("delete from public.workspace_members where workspace_id = $1 and user_id = $2", [
        t.agency.id,
        t.agencyOwner,
      ])
    )
    expect(remove.affectedRows).toBe(0)

    const promote = await db.asUser(t.agencyAdmin, (tx) =>
      tx.query(
        "update public.workspace_members set role = 'admin' where workspace_id = $1 and user_id = $2",
        [t.agency.id, t.agencyMember]
      )
    )
    expect(promote.affectedRows).toBe(1)
    // ...but never to owner.
    await expect(
      db.asUser(t.agencyAdmin, (tx) =>
        tx.query(
          "update public.workspace_members set role = 'owner' where workspace_id = $1 and user_id = $2",
          [t.agency.id, t.agencyMember]
        )
      )
    ).rejects.toThrow(/row-level security/)
  })

  it("a removed member loses access immediately; their account stays", async () => {
    const email = uniqueEmail("leaver")
    const invitee = await db.createUser(email)
    const created = await invite(t.agencyOwner, t.clientA.id, email)
    await accept(invitee, created.tokenHash)
    expect(await visibleWorkspaceIds(invitee)).toEqual([t.clientA.id])

    await db.asUser(t.agencyAdmin, (tx) =>
      tx.query("delete from public.workspace_members where workspace_id = $1 and user_id = $2", [
        t.clientA.id,
        invitee,
      ])
    )
    expect(await visibleWorkspaceIds(invitee)).toEqual([])
    const { rows } = await db.admin.query("select 1 from auth.users where id = $1", [invitee])
    expect(rows).toHaveLength(1)
  })
})

describe("audit log", () => {
  let t: Setup
  beforeAll(async () => {
    t = await setup()
  })

  const events = async (workspaceId: string) => {
    const { rows } = await db.admin.query<{
      event_type: string
      actor_user_id: string | null
      target_user_id: string | null
      target_email: string | null
      metadata: Record<string, unknown>
    }>(
      "select event_type, actor_user_id, target_user_id, target_email, metadata from private.audit_log where workspace_id = $1 order by id",
      [workspaceId]
    )
    return rows
  }

  it("records invitations, acceptance, role changes and removals with their actors", async () => {
    const email = uniqueEmail("audited")
    const invitee = await db.createUser(email)
    const created = await invite(t.agencyAdmin, t.agency.id, email, "member")
    await accept(invitee, created.tokenHash)
    await db.asUser(t.agencyOwner, (tx) =>
      tx.query(
        "update public.workspace_members set role = 'admin' where workspace_id = $1 and user_id = $2",
        [t.agency.id, invitee]
      )
    )
    await db.asUser(t.agencyOwner, (tx) =>
      tx.query("delete from public.workspace_members where workspace_id = $1 and user_id = $2", [
        t.agency.id,
        invitee,
      ])
    )
    const revoked = await invite(t.agencyOwner, t.agency.id, uniqueEmail("revoked"))
    await db.asUser(t.agencyOwner, (tx) =>
      tx.query("select public.revoke_workspace_invitation($1, $2)", [
        t.agency.id,
        revoked.invitation_id,
      ])
    )

    const log = (await events(t.agency.id)).filter(
      (event) => event.target_email === email || event.target_user_id === invitee
    )
    expect(log.map((event) => [event.event_type, event.actor_user_id])).toEqual([
      ["workspace.member_invited", t.agencyAdmin],
      ["workspace.member_added", invitee],
      ["workspace.invitation_accepted", invitee],
      ["workspace.member_role_changed", t.agencyOwner],
      ["workspace.member_removed", t.agencyOwner],
    ])
    expect(log[3]?.metadata).toEqual({ from: "member", to: "admin" })
    expect((await events(t.agency.id)).map((event) => event.event_type)).toContain(
      "workspace.invitation_revoked"
    )
    // Tokens and hashes never reach the log.
    const everything = JSON.stringify(await events(t.agency.id))
    expect(everything).not.toContain(created.tokenHash)
    expect(everything).not.toContain(revoked.tokenHash)
  })

  it("is invisible and read-only to users and anon", async () => {
    const runners = [
      (fn: (tx: Tx) => Promise<unknown>) => db.asAnon(fn),
      (fn: (tx: Tx) => Promise<unknown>) => db.asUser(t.agencyOwner, fn),
    ]
    for (const run of runners) {
      await expect(run((tx) => tx.query("select * from private.audit_log"))).rejects.toThrow(
        /permission denied/
      )
      await expect(
        run((tx) =>
          tx.query(
            "insert into private.audit_log (workspace_id, event_type) values ($1, 'workspace.forged')",
            [t.agency.id]
          )
        )
      ).rejects.toThrow(/permission denied/)
    }
    await expect(
      db.asUser(t.agencyOwner, (tx) =>
        tx.query("select private.write_audit_event($1, 'workspace.forged')", [t.agency.id])
      )
    ).rejects.toThrow(/permission denied/)
  })
})
