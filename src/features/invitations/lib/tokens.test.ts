import { describe, expect, it } from "vitest"
import { generateInvitationToken, hashInvitationToken } from "../server/tokens"
import { destinationAfterEmailLink } from "./pending-invitation"
import {
  invitationTokenFromPath,
  isWellFormedInvitationToken,
  redactInvitationPath,
} from "./tokens"

describe("invitation tokens", () => {
  it("are 256 random bits in URL-safe base64, different every time", () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => generateInvitationToken()))
    expect(tokens.size).toBe(1000)
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
      expect(Buffer.from(token, "base64url")).toHaveLength(32)
    }
  })

  it("are stored as a hex SHA-256 that reveals nothing about the token", () => {
    const token = generateInvitationToken()
    const hash = hashInvitationToken(token)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain(token)
    // Deterministic (lookups work) and sensitive to every character.
    expect(hashInvitationToken(token)).toBe(hash)
    expect(hashInvitationToken(`${token.slice(0, -1)}x`)).not.toBe(hash)
  })

  it("are checked for shape before anything reaches the database", () => {
    expect(isWellFormedInvitationToken(generateInvitationToken())).toBe(true)
    for (const bad of ["", "short", "a".repeat(44), `${"a".repeat(42)}=`, "../../etc", null, 42]) {
      expect(isWellFormedInvitationToken(bad)).toBe(false)
    }
  })

  it("can be read from an invitation path, and nothing else", () => {
    const token = generateInvitationToken()
    expect(invitationTokenFromPath(`/invite/${token}`)).toBe(token)
    expect(invitationTokenFromPath(`/invite/${token}/extra`)).toBeNull()
    expect(invitationTokenFromPath("/dashboard")).toBeNull()
    expect(invitationTokenFromPath(null)).toBeNull()
  })

  it("never reach error reports: the path is redacted", () => {
    const token = generateInvitationToken()
    expect(redactInvitationPath(`/invite/${token}`)).toBe("/invite/[token]")
    expect(redactInvitationPath("/w/acme/settings")).toBe("/w/acme/settings")
  })
})

describe("destinationAfterEmailLink", () => {
  const token = "a".repeat(43)

  it("sends a newly confirmed invitee back to their invitation", () => {
    expect(destinationAfterEmailLink("/dashboard", token)).toBe(`/invite/${token}`)
  })

  it("leaves other destinations (password reset) and missing or bad references alone", () => {
    expect(destinationAfterEmailLink("/reset-password", token)).toBe("/reset-password")
    expect(destinationAfterEmailLink("/dashboard", undefined)).toBe("/dashboard")
    expect(destinationAfterEmailLink("/dashboard", "not-a-token")).toBe("/dashboard")
    expect(destinationAfterEmailLink("/dashboard", "//evil.example")).toBe("/dashboard")
  })
})
