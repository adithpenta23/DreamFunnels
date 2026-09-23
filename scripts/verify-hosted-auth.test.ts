import { describe, expect, it, vi } from "vitest"
import { checkAuthSettings, checkSigningKeys, main } from "./verify-hosted-auth.mjs"

describe("checkAuthSettings", () => {
  it("passes when Supabase requires email confirmation", () => {
    expect(checkAuthSettings({ mailer_autoconfirm: false, disable_signup: false }).ok).toBe(true)
  })

  it("fails, saying where to fix it, when sign-ups are auto-confirmed", () => {
    const result = checkAuthSettings({ mailer_autoconfirm: true })
    expect(result.ok).toBe(false)
    expect(result.detail).toMatch(/Confirm email/)
  })

  it.each([null, {}, "nope"])("fails on an unexpected response %j", (body) => {
    expect(checkAuthSettings(body).ok).toBe(false)
  })
})

describe("checkSigningKeys", () => {
  it.each(["EC", "RSA", "OKP"])("passes with a published %s key", (kty) => {
    expect(checkSigningKeys({ keys: [{ kty, kid: "k1", alg: "ES256" }] }).ok).toBe(true)
  })

  it("fails with only the legacy shared secret (empty JWKS)", () => {
    const result = checkSigningKeys({ keys: [] })
    expect(result.ok).toBe(false)
    expect(result.detail).toMatch(/JWT Keys/)
  })

  it("never counts a symmetric key as asymmetric", () => {
    expect(checkSigningKeys({ keys: [{ kty: "oct" }] }).ok).toBe(false)
  })

  it("fails on a malformed response", () => {
    expect(checkSigningKeys({ keys: "none" }).ok).toBe(false)
  })
})

describe("main", () => {
  it("refuses to run without the target's URL and key", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    expect(await main({})).toBe(1)
  })
})
