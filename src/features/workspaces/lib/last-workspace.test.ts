import { describe, expect, it } from "vitest"
import {
  lastWorkspaceCookieString,
  parseLastWorkspace,
  serializeLastWorkspace,
} from "./last-workspace"

const userId = "6f1c1d0e-1a2b-4c3d-8e9f-0a1b2c3d4e5f"
const otherUser = "0a0a0a0a-1a2b-4c3d-8e9f-0a1b2c3d4e5f"

describe("last workspace preference", () => {
  it("round-trips for the same user", () => {
    expect(parseLastWorkspace(serializeLastWorkspace(userId, "acme"), userId)).toBe("acme")
  })

  it("is ignored for a different user on the same browser", () => {
    expect(parseLastWorkspace(serializeLastWorkspace(otherUser, "acme"), userId)).toBeNull()
  })

  it("accepts a URL-encoded value", () => {
    expect(parseLastWorkspace(encodeURIComponent(`${userId}:acme`), userId)).toBe("acme")
  })

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["without a user", "acme"],
    ["with a malformed slug", `${userId}:Not A Slug`],
    ["with broken encoding", "%E0%A4%A"],
  ])("is ignored when %s", (_label, value) => {
    expect(parseLastWorkspace(value, userId)).toBeNull()
  })

  it("builds a first-party, long-lived, lax cookie", () => {
    expect(lastWorkspaceCookieString(userId, "acme", true)).toBe(
      `df_last_workspace=${userId}:acme; Path=/; Max-Age=31536000; SameSite=Lax; Secure`
    )
    expect(lastWorkspaceCookieString(userId, "acme", false)).not.toContain("Secure")
  })
})
