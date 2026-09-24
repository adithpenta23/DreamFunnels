import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import { isAppError } from "@/lib/errors"
import { INVITATION_RATE_LIMITS, limitInvitationEmails } from "./rate-limits"

// Without SUPABASE_SECRET_KEY (as in tests) the limiter counts in memory.

describe("invitation rate limits", () => {
  it("caps emails to one recipient, across senders and workspaces", async () => {
    const recipientEmail = `${randomUUID()}@example.com`
    const { limit } = INVITATION_RATE_LIMITS.recipient
    for (let attempt = 0; attempt < limit; attempt++) {
      await limitInvitationEmails({
        senderId: randomUUID(),
        workspaceId: randomUUID(),
        recipientEmail,
      })
    }
    const blocked = await limitInvitationEmails({
      senderId: randomUUID(),
      workspaceId: randomUUID(),
      recipientEmail,
    }).catch((error: unknown) => error)
    expect(isAppError(blocked) && blocked.code).toBe("RATE_LIMITED")
    expect(isAppError(blocked) && blocked.expose).toBe(true)
  })

  it("caps one sender's pace", async () => {
    const senderId = randomUUID()
    const { limit } = INVITATION_RATE_LIMITS.sender
    for (let attempt = 0; attempt < limit; attempt++) {
      await limitInvitationEmails({
        senderId,
        workspaceId: randomUUID(),
        recipientEmail: `${randomUUID()}@example.com`,
      })
    }
    await expect(
      limitInvitationEmails({
        senderId,
        workspaceId: randomUUID(),
        recipientEmail: `${randomUUID()}@example.com`,
      })
    ).rejects.toMatchObject({ code: "RATE_LIMITED" })
  })

  it("has a documented, sensible starting policy", () => {
    expect(INVITATION_RATE_LIMITS).toEqual({
      sender: { name: "invitations.send.user", limit: 30, windowSeconds: 3600 },
      workspace: { name: "invitations.send.workspace", limit: 100, windowSeconds: 86400 },
      recipient: { name: "invitations.send.recipient", limit: 5, windowSeconds: 3600 },
    })
  })
})
