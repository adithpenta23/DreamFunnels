import { describe, expect, it, vi } from "vitest"
import { TURNSTILE_VERIFY_URL, verifyTurnstileToken } from "./turnstile"

/** A fake siteverify endpoint: no test ever reaches Cloudflare. */
function siteverify(body: unknown, status = 200) {
  return vi.fn<typeof fetch>(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      })
  )
}

const base = {
  secret: "test-secret",
  token: "token-from-widget",
  expectedAction: "signup" as const,
}

describe("verifyTurnstileToken", () => {
  it("accepts a token Cloudflare confirms for the expected action", async () => {
    const fetchMock = siteverify({ success: true, action: "signup", hostname: "app.example" })
    expect(await verifyTurnstileToken({ ...base, remoteIp: "203.0.113.7" }, fetchMock)).toEqual({
      ok: true,
    })

    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe(TURNSTILE_VERIFY_URL)
    expect(init?.method).toBe("POST")
    const sent = new URLSearchParams(init?.body as URLSearchParams)
    expect(Object.fromEntries(sent)).toEqual({
      secret: "test-secret",
      response: "token-from-widget",
      remoteip: "203.0.113.7",
    })
  })

  it.each([
    ["no token", undefined],
    ["an empty token", ""],
    ["a non-string token", 42],
    ["an oversized token", "x".repeat(2049)],
  ])("rejects %s without calling Cloudflare", async (_label, token) => {
    const fetchMock = siteverify({ success: true, action: "signup" })
    expect(await verifyTurnstileToken({ ...base, token }, fetchMock)).toEqual({
      ok: false,
      reason: "missing_token",
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("rejects a token Cloudflare refuses (expired, reused, forged)", async () => {
    const fetchMock = siteverify({ success: false, "error-codes": ["timeout-or-duplicate"] })
    expect(await verifyTurnstileToken(base, fetchMock)).toEqual({
      ok: false,
      reason: "rejected",
      errorCodes: ["timeout-or-duplicate"],
    })
  })

  it("rejects a valid token minted for another form", async () => {
    const fetchMock = siteverify({ success: true, action: "password_reset" })
    expect(await verifyTurnstileToken(base, fetchMock)).toEqual({
      ok: false,
      reason: "wrong_action",
    })
  })

  it("fails closed when Cloudflare can't be reached or errors", async () => {
    const offline = vi.fn<typeof fetch>(async () => {
      throw new TypeError("fetch failed")
    })
    expect(await verifyTurnstileToken(base, offline)).toEqual({ ok: false, reason: "unavailable" })
    expect(await verifyTurnstileToken(base, siteverify({}, 503))).toEqual({
      ok: false,
      reason: "unavailable",
      errorCodes: ["http_503"],
    })
  })

  it("never treats a truthy non-boolean as success", async () => {
    const fetchMock = siteverify({ success: "true", action: "signup" })
    expect((await verifyTurnstileToken(base, fetchMock)).ok).toBe(false)
  })
})
