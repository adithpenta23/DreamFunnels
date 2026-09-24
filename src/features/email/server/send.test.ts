import { afterEach, describe, expect, it, vi } from "vitest"
import { logger } from "@/lib/logger"
import { createFakeEmailProvider } from "@/test/fake-email"
import { sendTransactionalEmail } from "./send"

const from = { email: "no-reply@dreamfunnels.test", name: "DreamFunnels" }

const invitation = {
  to: "alex@example.com",
  template: "workspace-invitation" as const,
  variables: {
    invitedEmail: "alex@example.com",
    workspaceName: "ABC Roofing",
    inviterName: "John Smith",
    role: "member" as const,
    acceptUrl: "http://localhost:3000/invite/secret-token-value",
    expiresAt: new Date("2026-09-30T15:00:00Z"),
    timeZone: "UTC",
  },
  metadata: { idempotencyKey: "workspace-invitation:inv-1:abcd", context: { workspaceId: "ws-1" } },
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("sendTransactionalEmail", () => {
  it("renders the template and sends it to the recipient", async () => {
    const provider = createFakeEmailProvider()
    const result = await sendTransactionalEmail(invitation, { provider, from })

    expect(result).toEqual({ ok: true, provider: "fake", messageId: "fake-1" })
    expect(provider.sent).toHaveLength(1)
    const [message] = provider.sent
    expect(message).toMatchObject({
      from,
      to: { email: "alex@example.com" },
      subject: "John Smith invited you to join ABC Roofing on DreamFunnels",
      idempotencyKey: "workspace-invitation:inv-1:abcd",
      tags: { template: "workspace-invitation" },
    })
    expect(message?.html).toContain("http://localhost:3000/invite/secret-token-value")
  })

  it("sends nothing when a variable is missing, and says why", async () => {
    const provider = createFakeEmailProvider()
    const error = vi.spyOn(logger, "error").mockImplementation(() => {})
    const result = await sendTransactionalEmail(
      { ...invitation, variables: { ...invitation.variables, workspaceName: "" } },
      { provider, from }
    )
    expect(result).toEqual({ ok: false, provider: "fake", reason: "invalid_variables" })
    expect(provider.sent).toHaveLength(0)
    expect(error).toHaveBeenCalledWith(
      "email.invalid_variables",
      expect.objectContaining({ invalid: ["workspaceName"] })
    )
  })

  it("reports a provider failure without throwing", async () => {
    const provider = createFakeEmailProvider({ fail: { ok: false, reason: "unavailable" } })
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {})
    await expect(sendTransactionalEmail(invitation, { provider, from })).resolves.toEqual({
      ok: false,
      provider: "fake",
      reason: "unavailable",
    })
    expect(warn).toHaveBeenCalledWith(
      "email.failed",
      expect.objectContaining({ reason: "unavailable" })
    )
  })

  it("logs misconfiguration as an error: it needs a human", async () => {
    const provider = createFakeEmailProvider({
      fail: { ok: false, reason: "misconfigured", status: 401, code: "missing_api_key" },
    })
    const error = vi.spyOn(logger, "error").mockImplementation(() => {})
    await sendTransactionalEmail(invitation, { provider, from })
    expect(error).toHaveBeenCalledWith(
      "email.failed",
      expect.objectContaining({ reason: "misconfigured", code: "missing_api_key" })
    )
  })

  it("never logs the recipient, the content or the link", async () => {
    const provider = createFakeEmailProvider()
    const records: unknown[] = []
    for (const level of ["debug", "info", "warn", "error"] as const) {
      vi.spyOn(logger, level).mockImplementation((...args) => records.push(args))
    }
    await sendTransactionalEmail(invitation, { provider, from })
    provider.failWith({ ok: false, reason: "rejected", status: 422 })
    await sendTransactionalEmail(invitation, { provider, from })

    const logged = JSON.stringify(records)
    expect(logged).toContain("email.sent")
    expect(logged).not.toContain("alex@example.com")
    expect(logged).not.toContain("secret-token-value")
    expect(logged).not.toContain("ABC Roofing")
  })
})
