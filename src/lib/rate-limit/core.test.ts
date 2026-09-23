import { describe, expect, it, vi } from "vitest"
import { createRateLimiter, rateLimitKey, type RateLimitStore } from "./core"
import { createMemoryStore } from "./memory-store"

const policy = { name: "test.login.email", limit: 3, windowSeconds: 60 }

function clock(start = Date.UTC(2026, 8, 23, 12)) {
  let current = start
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms
    },
  }
}

describe("rateLimit", () => {
  it("allows up to the limit per window, then blocks with a retry time", async () => {
    const time = clock()
    const rateLimit = createRateLimiter(createMemoryStore({ now: time.now }), { now: time.now })

    const results = []
    for (let attempt = 0; attempt < 4; attempt += 1) {
      results.push(await rateLimit(policy, "ada@example.com"))
    }
    expect(results.map((result) => [result.allowed, result.remaining])).toEqual([
      [true, 2],
      [true, 1],
      [true, 0],
      [false, 0],
    ])
    expect(results[3]).toMatchObject({ policy: "test.login.email", retryAfterSeconds: 60 })

    time.advance(45_000)
    expect(await rateLimit(policy, "ada@example.com")).toMatchObject({
      allowed: false,
      retryAfterSeconds: 15,
    })
  })

  it("refills when the window ends", async () => {
    const time = clock()
    const rateLimit = createRateLimiter(createMemoryStore({ now: time.now }), { now: time.now })
    for (let attempt = 0; attempt < 4; attempt += 1) await rateLimit(policy, "ada@example.com")

    time.advance(60_000)
    expect(await rateLimit(policy, "ada@example.com")).toMatchObject({
      allowed: true,
      remaining: 2,
    })
  })

  it("keeps subjects and policies apart", async () => {
    const rateLimit = createRateLimiter(createMemoryStore())
    for (let attempt = 0; attempt < 4; attempt += 1) await rateLimit(policy, "ada@example.com")

    expect((await rateLimit(policy, "grace@example.com")).allowed).toBe(true)
    expect((await rateLimit({ ...policy, name: "test.other" }, "ada@example.com")).allowed).toBe(
      true
    )
  })

  it("treats subjects case- and whitespace-insensitively", async () => {
    const rateLimit = createRateLimiter(createMemoryStore())
    for (let attempt = 0; attempt < 3; attempt += 1) await rateLimit(policy, "Ada@Example.com ")
    expect((await rateLimit(policy, "ada@example.com")).allowed).toBe(false)
  })

  it("fails open, and reports, when the store is down", async () => {
    const failing: RateLimitStore = {
      name: "failing",
      hit: () => Promise.reject(new Error("connection refused")),
    }
    const onStoreError = vi.fn()
    const rateLimit = createRateLimiter(failing, { onStoreError })

    const result = await rateLimit(policy, "ada@example.com")
    expect(result).toMatchObject({ allowed: true, degraded: true })
    expect(onStoreError).toHaveBeenCalledWith(expect.any(Error), policy)
  })
})

describe("rateLimitKey", () => {
  it("never contains the subject itself", () => {
    const key = rateLimitKey(policy, "ada@example.com")
    expect(key).toMatch(/^test\.login\.email:[0-9a-f]{32}$/)
    expect(key).not.toContain("ada")
  })
})

describe("createMemoryStore", () => {
  it("stays bounded, evicting expired windows first", async () => {
    const time = clock()
    const store = createMemoryStore({ now: time.now, maxKeys: 2 })
    await store.hit("a", 1)
    await store.hit("b", 60)
    time.advance(2_000)
    await store.hit("c", 60) // "a" expired and is pruned
    expect((await store.hit("b", 60)).hits).toBe(2)
    expect((await store.hit("a", 60)).hits).toBe(1)
  })
})
