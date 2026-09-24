import { createHash, randomBytes } from "node:crypto"
import type { TestDb, Tx } from "./test-db"

/**
 * Fixture builders shared by the Sprint 4 suites. Workspaces and invitations
 * are created through the real functions, as the signed-in user; memberships
 * other than the creator's use a trusted shortcut (the product path is an
 * accepted invitation, tested in invitations.test.ts).
 */

export type Role = "member" | "admin" | "owner"

export function fixtures(db: TestDb) {
  let sequence = 0
  const uniqueEmail = (name: string) => `${name}.${++sequence}@example.test`
  const uniqueSlug = (name: string) => `${name}-${++sequence}`

  async function createAgency(ownerId: string, name = "Agency") {
    const { rows } = await db.asUser(ownerId, (tx) =>
      tx.query<{ id: string; slug: string; name: string }>(
        "select id, slug, name from public.create_workspace($1, $2)",
        [`${name} ${++sequence}`, uniqueSlug("agency")]
      )
    )
    const row = rows[0]
    if (!row) throw new Error("create_workspace returned no row")
    return row
  }

  async function createClient(userId: string, agencyId: string, name = "Client") {
    const { rows } = await db.asUser(userId, (tx) =>
      tx.query<{ id: string; slug: string; name: string }>(
        "select id, slug, name from public.create_client_workspace(p_agency_id => $1, p_name => $2)",
        [agencyId, `${name} ${++sequence}`]
      )
    )
    const row = rows[0]
    if (!row) throw new Error("create_client_workspace returned no row")
    return row
  }

  async function addMember(workspaceId: string, userId: string, role: Role) {
    await db.admin.query(
      "insert into public.workspace_members (workspace_id, user_id, role) values ($1, $2, $3)",
      [workspaceId, userId, role]
    )
  }

  /** A random 256-bit token's SHA-256, as the app stores it. */
  const newTokenHash = () =>
    createHash("sha256").update(randomBytes(32).toString("base64url")).digest("hex")

  async function invite(userId: string, workspaceId: string, email: string, role: Role = "member") {
    const tokenHash = newTokenHash()
    const { rows } = await db.asUser(userId, (tx) =>
      tx.query<{ outcome: string; invitation_id: string }>(
        "select * from public.create_workspace_invitation($1, $2, $3, $4)",
        [workspaceId, email, role, tokenHash]
      )
    )
    const row = rows[0]
    if (!row?.invitation_id) throw new Error("create_workspace_invitation returned no id")
    return { id: row.invitation_id, outcome: row.outcome, tokenHash }
  }

  async function rolesIn(workspaceId: string): Promise<Record<string, Role>> {
    const { rows } = await db.admin.query<{ user_id: string; role: Role }>(
      "select user_id, role from public.workspace_members where workspace_id = $1",
      [workspaceId]
    )
    return Object.fromEntries(rows.map((row) => [row.user_id, row.role]))
  }

  async function visibleWorkspaceIds(userId: string) {
    const { rows } = await db.asUser(userId, (tx) =>
      tx.query<{ id: string }>("select id from public.workspaces")
    )
    return rows.map((row) => row.id).sort()
  }

  /** Raw audit rows (superuser), oldest first. */
  async function auditEvents(workspaceId: string) {
    const { rows } = await db.admin.query<{
      event_type: string
      actor_user_id: string | null
      target_user_id: string | null
      metadata: Record<string, unknown>
    }>(
      "select event_type, actor_user_id, target_user_id, metadata from private.audit_log where workspace_id = $1 order by id",
      [workspaceId]
    )
    return rows
  }

  /**
   * An agency (owner, admin, member) with clients A (a direct owner, admin
   * and member of its own) and B, plus an unrelated agency with a client.
   */
  async function setup() {
    const agencyOwner = await db.createUser(uniqueEmail("agency-owner"), { full_name: "Ada Owner" })
    const agencyAdmin = await db.createUser(uniqueEmail("agency-admin"), {
      full_name: "Alan Admin",
    })
    const agencyMember = await db.createUser(uniqueEmail("agency-member"))
    const clientOwner = await db.createUser(uniqueEmail("client-owner"), {
      full_name: "Sarah Client",
    })
    const clientAdmin = await db.createUser(uniqueEmail("client-admin"))
    const clientMember = await db.createUser(uniqueEmail("client-member"), {
      full_name: "Mo Member",
    })
    const siblingMember = await db.createUser(uniqueEmail("sibling-member"))
    const otherOwner = await db.createUser(uniqueEmail("other-owner"))
    const outsider = await db.createUser(uniqueEmail("outsider"))

    const agency = await createAgency(agencyOwner)
    await addMember(agency.id, agencyAdmin, "admin")
    await addMember(agency.id, agencyMember, "member")
    const clientA = await createClient(agencyOwner, agency.id, "Client A")
    await addMember(clientA.id, clientOwner, "owner")
    await addMember(clientA.id, clientAdmin, "admin")
    await addMember(clientA.id, clientMember, "member")
    const clientB = await createClient(agencyOwner, agency.id, "Client B")
    await addMember(clientB.id, siblingMember, "member")

    const otherAgency = await createAgency(otherOwner, "Other agency")
    const otherClient = await createClient(otherOwner, otherAgency.id, "Other client")

    return {
      agencyOwner,
      agencyAdmin,
      agencyMember,
      clientOwner,
      clientAdmin,
      clientMember,
      siblingMember,
      otherOwner,
      outsider,
      agency,
      clientA,
      clientB,
      otherAgency,
      otherClient,
    }
  }

  return {
    uniqueEmail,
    createAgency,
    createClient,
    addMember,
    newTokenHash,
    invite,
    rolesIn,
    visibleWorkspaceIds,
    auditEvents,
    setup,
  }
}

export type Setup = Awaited<ReturnType<ReturnType<typeof fixtures>["setup"]>>

/** Runs a function that returns one text value and gives it back. */
export async function scalar(tx: Tx, sql: string, params: unknown[]): Promise<string | null> {
  const { rows } = await tx.query<{ value: string | null }>(`select ${sql} as value`, params)
  return rows[0]?.value ?? null
}
