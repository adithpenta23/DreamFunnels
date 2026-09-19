import { describe, expect, it, vi } from "vitest"
import { withPostgrestClockRetry } from "./postgrest-retry"

const REST_URL = "http://127.0.0.1:54321/rest/v1/workspaces?select=id"
const AUTH_URL = "http://127.0.0.1:54321/auth/v1/token?grant_type=password"
const NO_DELAYS = [0, 0]

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
const issuedInFuture = () =>
  json(401, { code: "PGRST303", details: null, hint: null, message: "JWT issued at future" })

describe("withPostgrestClockRetry", () => {
  it("retries a REST request when PostgREST rejects a just-issued token", async () => {
    const base = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(issuedInFuture())
      .mockResolvedValueOnce(json(200, [{ id: "w1" }]))
    const retrying = withPostgrestClockRetry(base, NO_DELAYS)

    const init = { method: "POST", body: JSON.stringify({ p_name: "Acme" }) }
    const response = await retrying(REST_URL, init)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([{ id: "w1" }])
    expect(base).toHaveBeenCalledTimes(2)
    // The same request is replayed, body included.
    expect(base).toHaveBeenLastCalledWith(REST_URL, init)
  })

  it("keeps trying once per configured delay", async () => {
    const base = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(issuedInFuture())
      .mockResolvedValueOnce(issuedInFuture())
      .mockResolvedValueOnce(json(200, []))
    const response = await withPostgrestClockRetry(base, NO_DELAYS)(REST_URL)
    expect(response.status).toBe(200)
    expect(base).toHaveBeenCalledTimes(3)
  })

  it("gives up after the last retry and returns the final answer", async () => {
    const base = vi.fn<typeof fetch>().mockImplementation(async () => issuedInFuture())
    const response = await withPostgrestClockRetry(base, NO_DELAYS)(new URL(REST_URL))
    expect(response.status).toBe(401)
    expect(base).toHaveBeenCalledTimes(3)
  })

  it.each([
    ["an expired token", json(401, { code: "PGRST301", message: "JWT expired" })],
    ["a permission error", json(403, { code: "42501", message: "permission denied" })],
    ["a non-JSON 401", new Response("Unauthorized", { status: 401 })],
    ["a success", json(200, [])],
  ])("passes %s through untouched", async (_label, answer) => {
    const base = vi.fn<typeof fetch>().mockResolvedValue(answer)
    const response = await withPostgrestClockRetry(base, NO_DELAYS)(REST_URL)
    expect(response).toBe(answer)
    expect(base).toHaveBeenCalledTimes(1)
  })

  it("never retries Auth requests", async () => {
    const base = vi.fn<typeof fetch>().mockImplementation(async () => issuedInFuture())
    await withPostgrestClockRetry(base, NO_DELAYS)(new Request(AUTH_URL, { method: "POST" }))
    expect(base).toHaveBeenCalledTimes(1)
  })
})
