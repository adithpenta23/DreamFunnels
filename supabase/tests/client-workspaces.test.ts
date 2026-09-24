import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createTestDb, type TestDb, type Tx } from "./helpers/test-db"

/**
 * Client workspace creation (Sprint 3): public.create_client_workspace() is the
 * only way to create a client, the parent is checked against the caller's own
 * authority, and the new client is a clean, separately isolated tenant.
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
const uniqueName = (name: string) => `${name} ${++sequence}`

type WorkspaceRow = {
  id: string
  name: string
  slug: string
  workspace_type: "agency" | "client"
  parent_workspace_id: string | null
  created_by: string | null
  timezone: string
  business_name: string | null
  business_email: string | null
  business_phone: string | null
  website_url: string | null
  address_line1: string | null
  address_line2: string | null
  address_city: string | null
  address_country: string | null
}

async function createAgency(ownerId: string) {
  const { rows } = await db.asUser(ownerId, (tx) =>
    tx.query<{ id: string; slug: string }>("select id, slug from public.create_workspace($1)", [
      uniqueName("Agency"),
    ])
  )
  const row = rows[0]
  if (!row) throw new Error("create_workspace returned no row")
  return row
}

type ClientInput = {
  agencyId: string
  name: string
  slug?: string | null
  timezone?: string | null
  businessName?: string | null
  businessEmail?: string | null
  businessPhone?: string | null
  websiteUrl?: string | null
  addressLine1?: string | null
  addressLine2?: string | null
  addressCity?: string | null
  addressCountry?: string | null
}

const createClientAs = (run: (fn: (tx: Tx) => Promise<unknown>) => Promise<unknown>) =>
  async function (input: ClientInput): Promise<WorkspaceRow> {
    const result = (await run((tx) =>
      tx.query<WorkspaceRow>(
        `select * from public.create_client_workspace(
           p_agency_id => $1, p_name => $2, p_slug => $3, p_timezone => $4,
           p_business_name => $5, p_business_email => $6, p_business_phone => $7,
           p_website_url => $8, p_address_line1 => $9, p_address_line2 => $10,
           p_address_city => $11, p_address_country => $12)`,
        [
          input.agencyId,
          input.name,
          input.slug ?? null,
          input.timezone ?? null,
          input.businessName ?? null,
          input.businessEmail ?? null,
          input.businessPhone ?? null,
          input.websiteUrl ?? null,
          input.addressLine1 ?? null,
          input.addressLine2 ?? null,
          input.addressCity ?? null,
          input.addressCountry ?? null,
        ]
      )
    )) as { rows: WorkspaceRow[] }
    const row = result.rows[0]
    if (!row) throw new Error("create_client_workspace returned no row")
    return row
  }

const createClient = (userId: string, input: ClientInput) =>
  createClientAs((fn) => db.asUser(userId, fn))(input)

async function addMember(workspaceId: string, userId: string, role: Role) {
  await db.admin.query(
    "insert into public.workspace_members (workspace_id, user_id, role) values ($1, $2, $3)",
    [workspaceId, userId, role]
  )
}

async function setup() {
  const owner = await db.createUser(uniqueEmail("owner"))
  const admin = await db.createUser(uniqueEmail("admin"))
  const member = await db.createUser(uniqueEmail("member"))
  const outsider = await db.createUser(uniqueEmail("outsider"))
  const agency = await createAgency(owner)
  await addMember(agency.id, admin, "admin")
  await addMember(agency.id, member, "member")
  const outsiderAgency = await createAgency(outsider)
  return { owner, admin, member, outsider, agency, outsiderAgency }
}

type Setup = Awaited<ReturnType<typeof setup>>

describe("who can create client workspaces", () => {
  let t: Setup
  beforeAll(async () => {
    t = await setup()
  })

  it("an agency owner creates a client under their agency, with the business profile", async () => {
    const client = await createClient(t.owner, {
      agencyId: t.agency.id,
      name: "  ABC Roofing  ",
      timezone: "America/Chicago",
      businessName: "ABC Roofing LLC",
      businessEmail: "hello@abc-roofing.example",
      businessPhone: "+15125550100",
      websiteUrl: "https://abc-roofing.example",
      addressLine1: "100 Congress Ave",
      addressLine2: "  ",
      addressCity: "Austin",
      addressCountry: "US",
    })

    expect(client).toMatchObject({
      name: "ABC Roofing",
      slug: "abc-roofing",
      workspace_type: "client",
      parent_workspace_id: t.agency.id,
      created_by: t.owner,
      timezone: "America/Chicago",
      business_name: "ABC Roofing LLC",
      business_phone: "+15125550100",
      website_url: "https://abc-roofing.example",
      address_line2: null,
      address_country: "US",
    })
  })

  it("an agency admin can create one too", async () => {
    const client = await createClient(t.admin, {
      agencyId: t.agency.id,
      name: uniqueName("By admin"),
    })
    expect(client.parent_workspace_id).toBe(t.agency.id)
    expect(client.timezone).toBe("UTC")
  })

  it("an agency member can't", async () => {
    await expect(
      createClient(t.member, { agencyId: t.agency.id, name: uniqueName("By member") })
    ).rejects.toMatchObject({ code: "42501" })
  })

  it("nobody can attach a client to someone else's agency", async () => {
    await expect(
      createClient(t.outsider, { agencyId: t.agency.id, name: uniqueName("Hijack") })
    ).rejects.toMatchObject({ code: "42501" })
    await expect(
      createClient(t.owner, { agencyId: t.outsiderAgency.id, name: uniqueName("Reverse hijack") })
    ).rejects.toMatchObject({ code: "42501" })
  })

  it("an unknown id gets the same answer as someone else's agency", async () => {
    await expect(
      createClient(t.owner, {
        agencyId: "00000000-0000-4000-8000-000000000000",
        name: uniqueName("Nowhere"),
      })
    ).rejects.toMatchObject({ code: "42501" })
  })

  it("a client can't have clients, even for its owners (depth stays one level)", async () => {
    const client = await createClient(t.owner, {
      agencyId: t.agency.id,
      name: uniqueName("Parent?"),
    })
    await expect(
      createClient(t.owner, { agencyId: client.id, name: uniqueName("Grandchild") })
    ).rejects.toMatchObject({ code: "42501" })
    // ...not even someone who owns the client directly.
    const clientOwner = await db.createUser(uniqueEmail("client-owner"))
    await addMember(client.id, clientOwner, "owner")
    await expect(
      createClient(clientOwner, { agencyId: client.id, name: uniqueName("Grandchild") })
    ).rejects.toMatchObject({ code: "42501" })
  })

  it("anon can't call it", async () => {
    await expect(
      createClientAs((fn) => db.asAnon(fn))({ agencyId: t.agency.id, name: uniqueName("Anon") })
    ).rejects.toThrow(/permission denied/)
  })

  it("the old direct paths stay closed: no INSERT, no re-parenting", async () => {
    await expect(
      db.asUser(t.owner, (tx) =>
        tx.query(
          "insert into public.workspaces (name, slug, workspace_type, parent_workspace_id) values ('X', $1, 'client', $2)",
          [`direct-${++sequence}`, t.agency.id]
        )
      )
    ).rejects.toThrow(/permission denied/)
    const client = await createClient(t.owner, { agencyId: t.agency.id, name: uniqueName("Stay") })
    await expect(
      db.asUser(t.owner, (tx) =>
        tx.query("update public.workspaces set parent_workspace_id = $1 where id = $2", [
          t.outsiderAgency.id,
          client.id,
        ])
      )
    ).rejects.toThrow(/permission denied/)
  })
})

describe("a new client workspace", () => {
  let t: Setup
  let client: WorkspaceRow
  beforeAll(async () => {
    t = await setup()
    client = await createClient(t.admin, { agencyId: t.agency.id, name: uniqueName("Fresh") })
  })

  it("starts empty: no direct members, no invitations", async () => {
    const members = await db.admin.query(
      "select 1 from public.workspace_members where workspace_id = $1",
      [client.id]
    )
    expect(members.rows).toHaveLength(0)
    const invitations = await db.admin.query(
      "select 1 from public.workspace_invitations where workspace_id = $1",
      [client.id]
    )
    expect(invitations.rows).toHaveLength(0)
  })

  it("is reached through the agency: owners own it, admins administer it, members see nothing", async () => {
    const role = async (userId: string) =>
      (
        await db.asUser(userId, (tx) =>
          tx.query<{ role: Role | null }>(
            "select public.viewer_role(w) as role from public.workspaces w where w.id = $1",
            [client.id]
          )
        )
      ).rows[0]?.role ?? null
    expect(await role(t.owner)).toBe("owner")
    expect(await role(t.admin)).toBe("admin")
    expect(await role(t.member)).toBeNull()
    expect(await role(t.outsider)).toBeNull()
  })

  it("lists under its agency with member counts in one query", async () => {
    const invitee = await db.createUser(uniqueEmail("client-staff"))
    await addMember(client.id, invitee, "member")
    const { rows } = await db.asUser(t.owner, (tx) =>
      tx.query<{ id: string; members: number }>(
        `select w.id, public.member_count(w) as members
         from public.workspaces w
         where w.parent_workspace_id = $1 and w.workspace_type = 'client'`,
        [t.agency.id]
      )
    )
    expect(rows).toContainEqual({ id: client.id, members: 1 })
  })

  it("records who created it in the agency's audit log", async () => {
    const { rows } = await db.admin.query<{
      actor_user_id: string
      metadata: Record<string, unknown>
    }>(
      `select actor_user_id, metadata from private.audit_log
       where workspace_id = $1 and event_type = 'workspace.client_created'`,
      [t.agency.id]
    )
    expect(rows).toContainEqual({
      actor_user_id: t.admin,
      metadata: { client_workspace_id: client.id },
    })
  })
})

describe("names, URLs and profile values", () => {
  let t: Setup
  beforeAll(async () => {
    t = await setup()
  })

  it("generates distinct URLs for names that slugify alike", async () => {
    const first = await createClient(t.owner, {
      agencyId: t.agency.id,
      name: "Joe & Sons Plumbing",
    })
    const second = await createClient(t.owner, {
      agencyId: t.agency.id,
      name: "Joe + Sons Plumbing",
    })
    expect(first.slug).toBe("joe-sons-plumbing")
    expect(second.slug).toMatch(/^joe-sons-plumbing-[0-9a-f]{6}$/)
  })

  it("rejects a chosen URL that's taken, reserved or malformed", async () => {
    const existing = await createClient(t.owner, {
      agencyId: t.agency.id,
      name: uniqueName("Taken"),
    })
    await expect(
      createClient(t.owner, {
        agencyId: t.agency.id,
        name: uniqueName("Copy"),
        slug: existing.slug,
      })
    ).rejects.toThrow(/workspaces_slug_key/)
    await expect(
      createClient(t.owner, { agencyId: t.agency.id, name: uniqueName("Reserved"), slug: "admin" })
    ).rejects.toThrow(/workspaces_slug_not_reserved/)
    await expect(
      createClient(t.owner, { agencyId: t.agency.id, name: uniqueName("Bad"), slug: "Bad Slug" })
    ).rejects.toThrow(/workspaces_slug_check/)
  })

  it("keeps client names unique within an agency, ignoring case and spaces", async () => {
    const name = uniqueName("Sunrise Dental")
    await createClient(t.owner, { agencyId: t.agency.id, name })
    await expect(
      createClient(t.admin, { agencyId: t.agency.id, name: `  ${name.toUpperCase()} ` })
    ).rejects.toThrow(/workspaces_client_name_key/)
    // Another agency may use the same name.
    const other = await createClient(t.outsider, { agencyId: t.outsiderAgency.id, name })
    expect(other.name).toBe(name)
  })

  it("validates the business profile with the table's constraints", async () => {
    await expect(
      createClient(t.owner, {
        agencyId: t.agency.id,
        name: uniqueName("P"),
        businessPhone: "555-0100",
      })
    ).rejects.toThrow(/workspaces_business_phone_check/)
    await expect(
      createClient(t.owner, { agencyId: t.agency.id, name: uniqueName("T"), timezone: "-05:00" })
    ).rejects.toThrow(/workspaces_timezone_check/)
    await expect(
      createClient(t.owner, {
        agencyId: t.agency.id,
        name: uniqueName("W"),
        websiteUrl: "ftp://x.example",
      })
    ).rejects.toThrow(/workspaces_website_url_check/)
    await expect(createClient(t.owner, { agencyId: t.agency.id, name: "   " })).rejects.toThrow(
      /workspaces_name_check/
    )
  })

  it("lets admins edit the website later, and nobody else", async () => {
    const client = await createClient(t.owner, { agencyId: t.agency.id, name: uniqueName("Site") })
    const update = (userId: string, url: string) =>
      db.asUser(userId, (tx) =>
        tx.query("update public.workspaces set website_url = $1 where id = $2", [url, client.id])
      )
    expect((await update(t.admin, "http://example.com")).affectedRows).toBe(1)
    expect((await update(t.member, "https://evil.example")).affectedRows).toBe(0)
    expect((await update(t.outsider, "https://evil.example")).affectedRows).toBe(0)
  })
})
