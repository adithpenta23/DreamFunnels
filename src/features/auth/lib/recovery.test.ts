import { describe, expect, it } from "vitest"
import { RECOVERY_WINDOW_SECONDS, isRecentRecovery } from "./recovery"

const now = 1_800_000_000

describe("isRecentRecovery", () => {
  it.each([
    ["a PKCE reset link (default templates)", "recovery"],
    ["a token_hash reset link (our templates), recorded as an OTP", "otp"],
    ["a magic link", "magiclink"],
  ])("accepts a session created moments ago by %s", (_label, method) => {
    expect(isRecentRecovery([{ method, timestamp: now - 30 }], now)).toBe(true)
  })

  it("accepts it anywhere in the window, alongside other methods", () => {
    const amr = [
      { method: "password", timestamp: now - 7200 },
      { method: "recovery", timestamp: now - RECOVERY_WINDOW_SECONDS },
    ]
    expect(isRecentRecovery(amr, now)).toBe(true)
  })

  it("rejects email links used longer ago than the window", () => {
    expect(
      isRecentRecovery([{ method: "otp", timestamp: now - RECOVERY_WINDOW_SECONDS - 1 }], now)
    ).toBe(false)
  })

  it.each(["password", "oauth", "token_refresh", "anonymous", "sso/saml"])(
    "rejects a '%s' session: it must use change-password, which asks for the current one",
    (method) => {
      expect(isRecentRecovery([{ method, timestamp: now }], now)).toBe(false)
    }
  )

  it.each([
    ["no claim", undefined],
    ["a malformed claim", "recovery"],
    ["the bare-string form, which has no timestamp", ["recovery"]],
    ["a timestamp from the future", [{ method: "recovery", timestamp: now + 3600 }]],
    ["a non-numeric timestamp", [{ method: "recovery", timestamp: String(now) }]],
  ])("rejects %s", (_label, amr) => {
    expect(isRecentRecovery(amr, now)).toBe(false)
  })
})
