import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createTestDb, type TestDb } from "./helpers/test-db"

/**
 * Tenant-isolation contract for the tenancy migrations.
 * Every policy change must keep this suite green; every new tenant table must
 * add an equivalent "outsider cannot read/write" test (see docs/QA.md).
 */

type Role = "member" | "admin" | "owner"

type WorkspaceRow = { id: string; name: string; slug: string; created_by: string }

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

/** Creates a workspace the way onboarding does: through create_workspace() as the user. */
async function createWorkspace(userId: string, name: string, slug: string | null = null) {
  const { rows } = await db.asUser(userId, (tx) =>
    tx.query<WorkspaceRow>(
      "select id, name, slug, created_by from public.create_workspace($1, $2)",
      [name, slug]
    )
  )
  const row = rows[0]
  if (!row) throw new Error("create_workspace returned no row")
  return row
}

async function addMember(workspaceId: string, userId: string, role: Role) {
  // Stands in for the future accept_invitation() function.
  await db.admin.query(
    "insert into public.workspace_members (workspace_id, user_id, role) values ($1, $2, $3)",
    [workspaceId, userId, role]
  )
}

/** A workspace with an owner, an admin and a member, plus an outsider with their own workspace. */
async function setupTenant() {
  const owner = await db.createUser(uniqueEmail("owner"))
  const admin = await db.createUser(uniqueEmail("admin"))
  const member = await db.createUser(uniqueEmail("member"))
  const outsider = await db.createUser(uniqueEmail("outsider"))
  const workspace = await createWorkspace(owner, "Tenant", uniqueSlug("tenant"))
  const outsiderWorkspace = await createWorkspace(outsider, "Outsider", uniqueSlug("outsider"))
  await addMember(workspace.id, admin, "admin")
  await addMember(workspace.id, member, "member")
  return {
    owner,
    admin,
    member,
    outsider,
    workspaceId: workspace.id,
    workspaceSlug: workspace.slug,
    outsiderWorkspaceId: outsiderWorkspace.id,
  }
}

describe("signup provisioning", () => {
  it("creates a profile but no workspace: the first workspace comes from onboarding", async () => {
    const userId = await db.createUser("Jane.Doe+promo@example.test", { full_name: "  Jane Doe " })

    const profile = await db.admin.query<{ email: string; full_name: string }>(
      "select email, full_name from public.profiles where id = $1",
      [userId]
    )
    expect(profile.rows).toEqual([{ email: "Jane.Doe+promo@example.test", full_name: "Jane Doe" }])

    const memberships = await db.admin.query(
      "select 1 from public.workspace_members where user_id = $1",
      [userId]
    )
    expect(memberships.rows).toHaveLength(0)

    const visible = await db.asUser(userId, (tx) => tx.query("select id from public.workspaces"))
    expect(visible.rows).toHaveLength(0)
  })

  it("ignores metadata that would break the profile's constraints", async () => {
    const userId = await db.createUser(uniqueEmail("meta"), {
      full_name: "x".repeat(500),
      avatar_url: `https://example.test/${"a".repeat(3000)}`,
    })
    const { rows } = await db.admin.query<{ name_length: number; avatar_url: string | null }>(
      "select char_length(full_name) as name_length, avatar_url from public.profiles where id = $1",
      [userId]
    )
    expect(rows).toEqual([{ name_length: 120, avatar_url: null }])
  })

  it("keeps the profile email in sync with auth.users", async () => {
    const userId = await db.createUser(uniqueEmail("rename"))
    await db.admin.query("update auth.users set email = $1 where id = $2", [
      "renamed@example.test",
      userId,
    ])
    const { rows } = await db.admin.query<{ email: string }>(
      "select email from public.profiles where id = $1",
      [userId]
    )
    expect(rows[0]?.email).toBe("renamed@example.test")
  })
})

describe("workspace creation (onboarding)", () => {
  it("makes the creator the owner of every workspace they create", async () => {
    const userId = await db.createUser(uniqueEmail("founder"))
    const first = await createWorkspace(userId, "  Acme Rockets  ", uniqueSlug("acme"))
    const second = await createWorkspace(userId, "Side Project")

    expect(first).toMatchObject({ name: "Acme Rockets", created_by: userId })
    const { rows } = await db.asUser(userId, (tx) =>
      tx.query<{ workspace_id: string; role: Role }>(
        "select workspace_id, role from public.workspace_members where user_id = $1 order by created_at",
        [userId]
      )
    )
    expect(rows).toEqual([
      { workspace_id: first.id, role: "owner" },
      { workspace_id: second.id, role: "owner" },
    ])
  })

  it("generates the slug from the name when none is given", async () => {
    const userId = await db.createUser(uniqueEmail("generated"))
    const workspace = await createWorkspace(userId, "Café Münster & Co.")
    expect(workspace.slug).toBe("cafe-munster-co")
  })

  it("treats a blank slug like a missing one", async () => {
    const userId = await db.createUser(uniqueEmail("blank"))
    const workspace = await createWorkspace(userId, "Blank Slug Studio", "   ")
    expect(workspace.slug).toBe("blank-slug-studio")
  })

  it("adds a random suffix when the generated slug is taken", async () => {
    const first = await createWorkspace(await db.createUser(uniqueEmail("a")), "Northwind Traders")
    const second = await createWorkspace(await db.createUser(uniqueEmail("b")), "Northwind Traders")
    expect(first.slug).toBe("northwind-traders")
    expect(second.slug).toMatch(/^northwind-traders-[0-9a-f]{6}$/)
  })

  it.each([
    ["names without usable characters", "日本語 !!!", /^workspace-[0-9a-f]{6}$/],
    ["names shorter than a valid slug", "AB", /^ab-[0-9a-f]{6}$/],
    ["names that slugify to a reserved word", "Admin", /^admin-[0-9a-f]{6}$/],
    ["very long names", "x".repeat(80), /^x{40}$/],
  ])("produces a valid slug for %s", async (_label, name, pattern) => {
    const userId = await db.createUser(uniqueEmail("edge"))
    const workspace = await createWorkspace(userId, name)
    expect(workspace.slug).toMatch(pattern)
  })

  it.each(["admin", "www", "api", "settings"])("rejects the reserved slug %j", async (slug) => {
    const userId = await db.createUser(uniqueEmail("reserved"))
    await expect(createWorkspace(userId, "Reserved", slug)).rejects.toThrow(
      /workspaces_slug_not_reserved/
    )
  })

  it.each(["Bad Slug", "-leading", "trailing-", "ab", "UPPER"])(
    "rejects the invalid slug %j",
    async (slug) => {
      const userId = await db.createUser(uniqueEmail("slugger"))
      await expect(createWorkspace(userId, "Name", slug)).rejects.toThrow(/check constraint/)
    }
  )

  it("rejects duplicate slugs chosen explicitly", async () => {
    const userId = await db.createUser(uniqueEmail("dupe"))
    const slug = uniqueSlug("taken")
    await createWorkspace(userId, "First", slug)
    await expect(createWorkspace(userId, "Second", slug)).rejects.toThrow(/duplicate key/)
  })

  it("rejects blank names", async () => {
    const userId = await db.createUser(uniqueEmail("nameless"))
    await expect(createWorkspace(userId, "   ", uniqueSlug("nameless"))).rejects.toThrow(
      /check constraint/
    )
  })

  it("rejects direct workspace inserts; creation goes through create_workspace()", async () => {
    const userId = await db.createUser(uniqueEmail("creator"))
    await expect(
      db.asUser(userId, (tx) =>
        tx.query("insert into public.workspaces (name, slug) values ($1, $2)", [
          "Direct",
          uniqueSlug("direct"),
        ])
      )
    ).rejects.toThrow(/permission denied/)
  })
})

describe("tenant isolation", () => {
  it("users only see workspaces they belong to", async () => {
    const t = await setupTenant()

    const outsiderView = await db.asUser(t.outsider, (tx) =>
      tx.query<{ id: string }>("select id from public.workspaces")
    )
    expect(outsiderView.rows.map((r) => r.id)).toEqual([t.outsiderWorkspaceId])

    const memberView = await db.asUser(t.member, (tx) =>
      tx.query<{ id: string }>("select id from public.workspaces")
    )
    expect(memberView.rows.map((r) => r.id)).toEqual([t.workspaceId])
  })

  it("a slug lookup for someone else's workspace returns nothing", async () => {
    const t = await setupTenant()
    const { rows } = await db.asUser(t.outsider, (tx) =>
      tx.query("select id from public.workspaces where slug = $1", [t.workspaceSlug])
    )
    expect(rows).toHaveLength(0)
  })

  it("users cannot see memberships of other workspaces", async () => {
    const t = await setupTenant()
    const { rows } = await db.asUser(t.outsider, (tx) =>
      tx.query("select * from public.workspace_members where workspace_id = $1", [t.workspaceId])
    )
    expect(rows).toHaveLength(0)
  })

  it("users can read co-member profiles but not strangers'", async () => {
    const t = await setupTenant()
    const coMember = await db.asUser(t.member, (tx) =>
      tx.query("select id from public.profiles where id = $1", [t.owner])
    )
    expect(coMember.rows).toHaveLength(1)

    const stranger = await db.asUser(t.outsider, (tx) =>
      tx.query("select id from public.profiles where id = $1", [t.owner])
    )
    expect(stranger.rows).toHaveLength(0)
  })

  it("outsiders cannot modify another tenant's workspace or memberships", async () => {
    const t = await setupTenant()

    const rename = await db.asUser(t.outsider, (tx) =>
      tx.query("update public.workspaces set name = 'pwned' where id = $1", [t.workspaceId])
    )
    const reslug = await db.asUser(t.outsider, (tx) =>
      tx.query("update public.workspaces set slug = $2 where id = $1", [
        t.workspaceId,
        uniqueSlug("pwned"),
      ])
    )
    const removal = await db.asUser(t.outsider, (tx) =>
      tx.query("delete from public.workspace_members where workspace_id = $1", [t.workspaceId])
    )
    const deletion = await db.asUser(t.outsider, (tx) =>
      tx.query("delete from public.workspaces where id = $1", [t.workspaceId])
    )
    expect(rename.affectedRows).toBe(0)
    expect(reslug.affectedRows).toBe(0)
    expect(removal.affectedRows).toBe(0)
    expect(deletion.affectedRows).toBe(0)

    const { rows } = await db.admin.query<{ name: string; slug: string; members: number }>(
      `select w.name, w.slug, (select count(*)::int from public.workspace_members m where m.workspace_id = w.id) as members
       from public.workspaces w where w.id = $1`,
      [t.workspaceId]
    )
    expect(rows).toEqual([{ name: "Tenant", slug: t.workspaceSlug, members: 3 }])
  })

  it("outsiders cannot add themselves to another workspace", async () => {
    const t = await setupTenant()
    await expect(
      db.asUser(t.outsider, (tx) =>
        tx.query(
          "insert into public.workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')",
          [t.workspaceId, t.outsider]
        )
      )
    ).rejects.toThrow(/permission denied/)
  })

  it("members cannot move a membership to another workspace", async () => {
    const t = await setupTenant()
    await expect(
      db.asUser(t.owner, (tx) =>
        tx.query(
          "update public.workspace_members set workspace_id = $1 where workspace_id = $2 and user_id = $3",
          [t.outsiderWorkspaceId, t.workspaceId, t.member]
        )
      )
    ).rejects.toThrow(/permission denied/)
  })
})

describe("anonymous access", () => {
  it.each(["profiles", "workspaces", "workspace_members"])(
    "denies anonymous reads of public.%s",
    async (table) => {
      await expect(db.asAnon((tx) => tx.query(`select * from public.${table}`))).rejects.toThrow(
        /permission denied/
      )
    }
  )

  it("denies anonymous workspace creation", async () => {
    await expect(
      db.asAnon((tx) =>
        tx.query("select * from public.create_workspace($1, $2)", ["Anon", uniqueSlug("anon")])
      )
    ).rejects.toThrow(/permission denied/)
  })
})

describe("workspace roles", () => {
  it("lets admins, but not members, rename a workspace", async () => {
    const t = await setupTenant()
    const byMember = await db.asUser(t.member, (tx) =>
      tx.query("update public.workspaces set name = 'Member edit' where id = $1", [t.workspaceId])
    )
    const byAdmin = await db.asUser(t.admin, (tx) =>
      tx.query("update public.workspaces set name = 'Admin edit' where id = $1", [t.workspaceId])
    )
    expect(byMember.affectedRows).toBe(0)
    expect(byAdmin.affectedRows).toBe(1)
  })

  it("lets admins, but not members, change the workspace slug", async () => {
    const t = await setupTenant()
    const byMember = await db.asUser(t.member, (tx) =>
      tx.query("update public.workspaces set slug = $2 where id = $1", [
        t.workspaceId,
        uniqueSlug("member-edit"),
      ])
    )
    const newSlug = uniqueSlug("admin-edit")
    const byAdmin = await db.asUser(t.admin, (tx) =>
      tx.query("update public.workspaces set slug = $2 where id = $1", [t.workspaceId, newSlug])
    )
    expect(byMember.affectedRows).toBe(0)
    expect(byAdmin.affectedRows).toBe(1)

    const { rows } = await db.admin.query<{ slug: string }>(
      "select slug from public.workspaces where id = $1",
      [t.workspaceId]
    )
    expect(rows[0]?.slug).toBe(newSlug)
  })

  it("rejects slug changes that are taken, reserved or malformed", async () => {
    const t = await setupTenant()
    const rename = (slug: string) =>
      db.asUser(t.owner, (tx) =>
        tx.query("update public.workspaces set slug = $2 where id = $1", [t.workspaceId, slug])
      )

    const { rows } = await db.admin.query<{ slug: string }>(
      "select slug from public.workspaces where id = $1",
      [t.outsiderWorkspaceId]
    )
    await expect(rename(rows[0]?.slug ?? "")).rejects.toThrow(/duplicate key/)
    await expect(rename("www")).rejects.toThrow(/workspaces_slug_not_reserved/)
    await expect(rename("Not A Slug")).rejects.toThrow(/check constraint/)
  })

  it("only lets owners delete a workspace, cascading its memberships", async () => {
    const t = await setupTenant()
    const byAdmin = await db.asUser(t.admin, (tx) =>
      tx.query("delete from public.workspaces where id = $1", [t.workspaceId])
    )
    expect(byAdmin.affectedRows).toBe(0)

    const byOwner = await db.asUser(t.owner, (tx) =>
      tx.query("delete from public.workspaces where id = $1", [t.workspaceId])
    )
    expect(byOwner.affectedRows).toBe(1)

    const { rows } = await db.admin.query(
      "select 1 from public.workspace_members where workspace_id = $1",
      [t.workspaceId]
    )
    expect(rows).toHaveLength(0)
  })

  it("lets admins change member roles but not grant ownership", async () => {
    const t = await setupTenant()
    const promote = await db.asUser(t.admin, (tx) =>
      tx.query(
        "update public.workspace_members set role = 'admin' where workspace_id = $1 and user_id = $2",
        [t.workspaceId, t.member]
      )
    )
    expect(promote.affectedRows).toBe(1)

    await expect(
      db.asUser(t.admin, (tx) =>
        tx.query(
          "update public.workspace_members set role = 'owner' where workspace_id = $1 and user_id = $2",
          [t.workspaceId, t.member]
        )
      )
    ).rejects.toThrow(/row-level security/)
  })

  it("prevents admins from demoting owners and members from changing roles", async () => {
    const t = await setupTenant()
    const adminDemotesOwner = await db.asUser(t.admin, (tx) =>
      tx.query(
        "update public.workspace_members set role = 'member' where workspace_id = $1 and user_id = $2",
        [t.workspaceId, t.owner]
      )
    )
    const memberPromotesSelf = await db.asUser(t.member, (tx) =>
      tx.query(
        "update public.workspace_members set role = 'admin' where workspace_id = $1 and user_id = $2",
        [t.workspaceId, t.member]
      )
    )
    expect(adminDemotesOwner.affectedRows).toBe(0)
    expect(memberPromotesSelf.affectedRows).toBe(0)
  })

  it("lets members leave but not remove others", async () => {
    const t = await setupTenant()
    const removeOther = await db.asUser(t.member, (tx) =>
      tx.query("delete from public.workspace_members where workspace_id = $1 and user_id = $2", [
        t.workspaceId,
        t.admin,
      ])
    )
    const leave = await db.asUser(t.member, (tx) =>
      tx.query("delete from public.workspace_members where workspace_id = $1 and user_id = $2", [
        t.workspaceId,
        t.member,
      ])
    )
    expect(removeOther.affectedRows).toBe(0)
    expect(leave.affectedRows).toBe(1)
  })

  it("never leaves a workspace without an owner", async () => {
    const t = await setupTenant()
    await expect(
      db.asUser(t.owner, (tx) =>
        tx.query("delete from public.workspace_members where workspace_id = $1 and user_id = $2", [
          t.workspaceId,
          t.owner,
        ])
      )
    ).rejects.toThrow(/at least one owner/)
    await expect(
      db.asUser(t.owner, (tx) =>
        tx.query(
          "update public.workspace_members set role = 'admin' where workspace_id = $1 and user_id = $2",
          [t.workspaceId, t.owner]
        )
      )
    ).rejects.toThrow(/at least one owner/)

    // With a second owner in place, the original owner may step down.
    await db.asUser(t.owner, (tx) =>
      tx.query(
        "update public.workspace_members set role = 'owner' where workspace_id = $1 and user_id = $2",
        [t.workspaceId, t.admin]
      )
    )
    const leave = await db.asUser(t.owner, (tx) =>
      tx.query("delete from public.workspace_members where workspace_id = $1 and user_id = $2", [
        t.workspaceId,
        t.owner,
      ])
    )
    expect(leave.affectedRows).toBe(1)
  })
})

describe("profiles", () => {
  it("lets users edit their display fields but not identity columns", async () => {
    const userId = await db.createUser(uniqueEmail("profile"))
    const rename = await db.asUser(userId, (tx) =>
      tx.query("update public.profiles set full_name = 'New Name' where id = $1", [userId])
    )
    expect(rename.affectedRows).toBe(1)

    await expect(
      db.asUser(userId, (tx) =>
        tx.query("update public.profiles set email = 'spoof@example.test' where id = $1", [userId])
      )
    ).rejects.toThrow(/permission denied/)

    const workspace = await createWorkspace(userId, "Mine", uniqueSlug("mine"))
    await expect(
      db.asUser(userId, (tx) =>
        tx.query("update public.workspaces set created_by = null where id = $1", [workspace.id])
      )
    ).rejects.toThrow(/permission denied/)
  })

  it("does not let users edit someone else's profile", async () => {
    const t = await setupTenant()
    const edit = await db.asUser(t.member, (tx) =>
      tx.query("update public.profiles set full_name = 'Hijacked' where id = $1", [t.owner])
    )
    expect(edit.affectedRows).toBe(0)
  })
})
