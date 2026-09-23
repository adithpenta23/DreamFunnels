import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createTestDb, type TestDb } from "./helpers/test-db"

/**
 * Storage behind the app-level auth rate limiter (src/lib/rate-limit): a
 * fixed-window counter only the service role can touch.
 */

let db: TestDb
let sequence = 0

beforeAll(async () => {
  db = await createTestDb()
})

afterAll(async () => {
  await db.close()
})

const uniqueKey = () => `test.policy:${(++sequence).toString(16).padStart(32, "0")}`

type Hit = { hits: number; window_ends_at: Date }

async function hit(key: string, windowSeconds = 60): Promise<Hit> {
  const { rows } = await db.asServiceRole((tx) =>
    tx.query<Hit>("select hits, window_ends_at from public.rate_limit_hit($1, $2)", [
      key,
      windowSeconds,
    ])
  )
  const row = rows[0]
  if (!row) throw new Error("rate_limit_hit returned no row")
  return row
}

describe("rate_limit_hit()", () => {
  it("counts hits per key within one fixed window", async () => {
    const key = uniqueKey()
    const first = await hit(key)
    const second = await hit(key)
    const third = await hit(key)

    expect([first.hits, second.hits, third.hits]).toEqual([1, 2, 3])
    expect(second.window_ends_at).toEqual(first.window_ends_at)
    const windowMs = first.window_ends_at.getTime() - Date.now()
    expect(windowMs).toBeGreaterThan(50_000)
    expect(windowMs).toBeLessThanOrEqual(60_000)
  })

  it("keeps keys independent", async () => {
    const a = uniqueKey()
    const b = uniqueKey()
    await hit(a)
    await hit(a)
    expect((await hit(b)).hits).toBe(1)
  })

  it("starts a new window once the old one has ended", async () => {
    const key = uniqueKey()
    await hit(key)
    await hit(key)
    await db.admin.query(
      "update private.rate_limit_counters set window_ends_at = now() - interval '1 second' where key = $1",
      [key]
    )
    const next = await hit(key, 30)
    expect(next.hits).toBe(1)
    expect(next.window_ends_at.getTime()).toBeGreaterThan(Date.now())
  })

  it.each([
    ["an empty key", "", 60],
    ["an oversized key", "k".repeat(201), 60],
    ["a zero window", "ok", 0],
    ["a window over a day", "ok", 86_401],
  ])("rejects %s", async (_label, key, windowSeconds) => {
    await expect(hit(key, windowSeconds)).rejects.toThrow(/Invalid rate limit/)
  })

  it.each([
    ["anonymous visitors", "anon"],
    ["signed-in users", "authenticated"],
  ] as const)("can't be called by %s (publishable key)", async (_label, role) => {
    const userId = await db.createUser(`limiter.${++sequence}@example.test`)
    const call = (sql: string) =>
      role === "anon"
        ? db.asAnon((tx) => tx.query(sql, [uniqueKey()]))
        : db.asUser(userId, (tx) => tx.query(sql, [uniqueKey()]))

    await expect(call("select * from public.rate_limit_hit($1, 60)")).rejects.toThrow(
      /permission denied/
    )
    await expect(call("select * from private.rate_limit_counters where key = $1")).rejects.toThrow(
      /permission denied/
    )
  })
})
