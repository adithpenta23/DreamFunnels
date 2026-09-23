import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createTestDb, type TestDb } from "./helpers/test-db"

/**
 * Workspace business profile, time zones and personal preferences (Sprint 2):
 * constraints hold for every writer, and only the right people can write.
 */

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

async function createWorkspace(userId: string, timezone: string | null = null) {
  const { rows } = await db.asUser(userId, (tx) =>
    tx.query<{ id: string; timezone: string }>(
      "select id, timezone from public.create_workspace($1, $2, $3)",
      ["Profile Co", uniqueSlug("profile"), timezone]
    )
  )
  const row = rows[0]
  if (!row) throw new Error("create_workspace returned no row")
  return row
}

async function setup() {
  const owner = await db.createUser(uniqueEmail("owner"))
  const member = await db.createUser(uniqueEmail("member"))
  const workspace = await createWorkspace(owner)
  await db.admin.query(
    "insert into public.workspace_members (workspace_id, user_id, role) values ($1, $2, 'member')",
    [workspace.id, member]
  )
  return { owner, member, workspaceId: workspace.id }
}

describe("workspace time zone", () => {
  it("defaults to UTC and can be set at creation", async () => {
    const userId = await db.createUser(uniqueEmail("tz"))
    expect((await createWorkspace(userId)).timezone).toBe("UTC")
    expect((await createWorkspace(userId, "America/Chicago")).timezone).toBe("America/Chicago")
  })

  it("rejects an invalid time zone at creation", async () => {
    const userId = await db.createUser(uniqueEmail("tz-bad"))
    await expect(createWorkspace(userId, "-5")).rejects.toThrow(/workspaces_timezone_check/)
  })

  it.each([
    "America/New_York",
    "America/Argentina/Buenos_Aires",
    "America/Port-au-Prince",
    "Asia/Kolkata",
    "UTC",
  ])("accepts the IANA zone %j", async (timezone) => {
    const t = await setup()
    const update = await db.asUser(t.owner, (tx) =>
      tx.query("update public.workspaces set timezone = $2 where id = $1", [
        t.workspaceId,
        timezone,
      ])
    )
    expect(update.affectedRows).toBe(1)
  })

  it.each([
    ["a bare offset", "-5"],
    ["an ISO offset", "-05:00"],
    ["a POSIX string", "UTC+5"],
    ["an Etc/GMT fixed offset", "Etc/GMT+5"],
    ["an abbreviation", "EST"],
    ["an unknown zone", "Mars/Olympus_Mons"],
    ["an empty string", ""],
    ["a lowercase variant", "america/chicago"],
  ])("rejects %s", async (_label, timezone) => {
    const t = await setup()
    await expect(
      db.asUser(t.owner, (tx) =>
        tx.query("update public.workspaces set timezone = $2 where id = $1", [
          t.workspaceId,
          timezone,
        ])
      )
    ).rejects.toThrow(/workspaces_timezone_check/)
  })

  it("can't be cleared: a workspace always has a time zone", async () => {
    const t = await setup()
    await expect(
      db.asUser(t.owner, (tx) =>
        tx.query("update public.workspaces set timezone = null where id = $1", [t.workspaceId])
      )
    ).rejects.toThrow(/null value/)
  })
})

describe("workspace business profile", () => {
  const profile = {
    business_name: "Acme Roofing LLC",
    business_email: "hello@acme-roofing.example",
    business_phone: "+15125550100",
    address_line1: "100 Congress Ave",
    address_line2: "Suite 200",
    address_city: "Austin",
    address_region: "TX",
    address_postal_code: "78701",
    address_country: "US",
    logo_url: "https://cdn.example.com/logo.png",
    brand_primary_color: "#1d4ed8",
    brand_secondary_color: "#f59e0b",
  }
  const columns = Object.keys(profile)
  const assignments = columns.map((column, index) => `${column} = $${index + 2}`).join(", ")

  it("lets admins and owners save it, but not members or outsiders", async () => {
    const t = await setup()
    const outsider = await db.createUser(uniqueEmail("outsider"))
    const write = (userId: string) =>
      db.asUser(userId, (tx) =>
        tx.query(`update public.workspaces set ${assignments} where id = $1`, [
          t.workspaceId,
          ...Object.values(profile),
        ])
      )

    expect((await write(t.member)).affectedRows).toBe(0)
    expect((await write(outsider)).affectedRows).toBe(0)
    expect((await write(t.owner)).affectedRows).toBe(1)

    const { rows } = await db.admin.query(
      `select ${columns.join(", ")} from public.workspaces where id = $1`,
      [t.workspaceId]
    )
    expect(rows).toEqual([profile])
  })

  it.each([
    ["business_name", "   ", "workspaces_business_name_check"],
    ["business_name", "x".repeat(121), "workspaces_business_name_check"],
    ["business_email", "not-an-email", "workspaces_business_email_check"],
    ["business_phone", "(512) 555-0100", "workspaces_business_phone_check"],
    ["business_phone", "+0123456789", "workspaces_business_phone_check"],
    ["business_phone", "+1234", "workspaces_business_phone_check"],
    ["address_country", "usa", "workspaces_address_country_check"],
    ["address_postal_code", "x".repeat(21), "workspaces_address_postal_code_check"],
    ["logo_url", "http://example.com/logo.png", "workspaces_logo_url_check"],
    ["logo_url", "javascript:alert(1)", "workspaces_logo_url_check"],
    ["brand_primary_color", "#FFF", "workspaces_brand_primary_color_check"],
    ["brand_secondary_color", "red", "workspaces_brand_secondary_color_check"],
  ])("rejects %s = %j", async (column, value, constraint) => {
    const t = await setup()
    await expect(
      db.asUser(t.owner, (tx) =>
        tx.query(`update public.workspaces set ${column} = $2 where id = $1`, [
          t.workspaceId,
          value,
        ])
      )
    ).rejects.toThrow(new RegExp(constraint))
  })

  it("lets every field be cleared back to null", async () => {
    const t = await setup()
    const clear = columns.map((column) => `${column} = null`).join(", ")
    const update = await db.asUser(t.owner, (tx) =>
      tx.query(`update public.workspaces set ${clear} where id = $1`, [t.workspaceId])
    )
    expect(update.affectedRows).toBe(1)
  })

  it("keeps identity and hierarchy columns out of reach", async () => {
    const t = await setup()
    for (const set of [
      "created_by = null",
      "id = gen_random_uuid()",
      "workspace_type = 'client'",
    ]) {
      await expect(
        db.asUser(t.owner, (tx) =>
          tx.query(`update public.workspaces set ${set} where id = $1`, [t.workspaceId])
        )
      ).rejects.toThrow(/permission denied/)
    }
  })
})

describe("personal preferences (profiles)", () => {
  it("lets users set their phone, time zone and locale", async () => {
    const userId = await db.createUser(uniqueEmail("prefs"))
    const update = await db.asUser(userId, (tx) =>
      tx.query("update public.profiles set phone = $2, timezone = $3, locale = $4 where id = $1", [
        userId,
        "+442071838750",
        "Europe/London",
        "en-GB",
      ])
    )
    expect(update.affectedRows).toBe(1)
  })

  it("doesn't let users change someone else's preferences", async () => {
    const t = await setup()
    const update = await db.asUser(t.member, (tx) =>
      tx.query("update public.profiles set timezone = 'Asia/Tokyo' where id = $1", [t.owner])
    )
    expect(update.affectedRows).toBe(0)
  })

  it.each([
    ["phone", "555-0100", "profiles_phone_check"],
    ["timezone", "GMT-5", "profiles_timezone_check"],
    ["locale", "english", "profiles_locale_check"],
    ["locale", "en_US", "profiles_locale_check"],
  ])("rejects %s = %j", async (column, value, constraint) => {
    const userId = await db.createUser(uniqueEmail("prefs-bad"))
    await expect(
      db.asUser(userId, (tx) =>
        tx.query(`update public.profiles set ${column} = $2 where id = $1`, [userId, value])
      )
    ).rejects.toThrow(new RegExp(constraint))
  })

  it.each(["en-US", "pt-BR", "zh-Hant-TW", "es-419", "fil"])(
    "accepts the locale %j",
    async (locale) => {
      const userId = await db.createUser(uniqueEmail("locale"))
      const update = await db.asUser(userId, (tx) =>
        tx.query("update public.profiles set locale = $2 where id = $1", [userId, locale])
      )
      expect(update.affectedRows).toBe(1)
    }
  )

  it("gives new users UTC and en-US until they choose", async () => {
    const userId = await db.createUser(uniqueEmail("defaults"))
    const { rows } = await db.admin.query(
      "select phone, timezone, locale from public.profiles where id = $1",
      [userId]
    )
    expect(rows).toEqual([{ phone: null, timezone: "UTC", locale: "en-US" }])
  })
})
