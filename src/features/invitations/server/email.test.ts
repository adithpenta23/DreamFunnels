import { describe, expect, it } from "vitest"
import { createFakeEmailProvider } from "@/test/fake-email"
import { invitationUrl, sendInvitationEmail, type InvitationEmail } from "./email"
import { generateInvitationToken, hashInvitationToken } from "./tokens"

const token = generateInvitationToken()
const invitation: InvitationEmail = {
  invitationId: "11111111-2222-4333-8444-555555555555",
  token,
  tokenHash: hashInvitationToken(token),
  to: "alex@example.com",
  role: "admin",
  workspaceId: "6f1c1d0e-1a2b-4c3d-8e9f-0a1b2c3d4e5f",
  workspaceName: "ABC Roofing",
  timeZone: "America/Chicago",
  inviterName: "John Smith",
  message: null,
  expiresAt: new Date("2026-09-30T15:00:00Z"),
}

describe("invitationUrl", () => {
  it("is built on the configured app URL, never a request's host", () => {
    expect(invitationUrl(token, "https://app.dreamfunnels.example")).toBe(
      `https://app.dreamfunnels.example/invite/${token}`
    )
    // Tests run with NEXT_PUBLIC_APP_URL=http://localhost:3000 (vitest.config.mts).
    expect(invitationUrl(token)).toBe(`http://localhost:3000/invite/${token}`)
  })
})

describe("sendInvitationEmail", () => {
  it("emails the invitee the right workspace, role, link and expiry", async () => {
    const provider = createFakeEmailProvider()
    const result = await sendInvitationEmail(invitation, { provider })

    expect(result).toMatchObject({ ok: true })
    const [message] = provider.sent
    expect(message?.to).toEqual({ email: "alex@example.com" })
    expect(message?.subject).toBe("John Smith invited you to join ABC Roofing on DreamFunnels")
    expect(message?.text).toContain("as an admin")
    expect(message?.text).toContain(`http://localhost:3000/invite/${token}`)
    expect(message?.text).toContain("September 30, 2026")
  })

  it("keys provider retries on the invitation and token hash, never the token", async () => {
    const provider = createFakeEmailProvider()
    await sendInvitationEmail(invitation, { provider })
    const key = provider.sent[0]?.idempotencyKey ?? ""
    expect(key).toBe(
      `workspace-invitation:${invitation.invitationId}:${invitation.tokenHash.slice(0, 16)}`
    )
    expect(key).not.toContain(token)
  })

  it("reports a provider failure instead of throwing", async () => {
    const provider = createFakeEmailProvider({ fail: { ok: false, reason: "rate_limited" } })
    await expect(sendInvitationEmail(invitation, { provider })).resolves.toMatchObject({
      ok: false,
      reason: "rate_limited",
    })
  })
})
