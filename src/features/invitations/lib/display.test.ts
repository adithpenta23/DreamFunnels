import { describe, expect, it } from "vitest"
import { invitationRowStatus, invitationStatusDetail, relativeTime } from "./display"

const now = new Date("2026-09-23T12:00:00Z")
const inDays = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString()

describe("invitation display", () => {
  it("is pending until it expires", () => {
    expect(invitationRowStatus({ expiresAt: inDays(6), deliveryStatus: "sent" }, now)).toBe(
      "pending"
    )
    expect(invitationRowStatus({ expiresAt: inDays(0), deliveryStatus: "sent" }, now)).toBe(
      "expired"
    )
    expect(invitationRowStatus({ expiresAt: inDays(-2), deliveryStatus: "failed" }, now)).toBe(
      "expired"
    )
  })

  it("flags an invitation whose email wasn't delivered", () => {
    expect(invitationRowStatus({ expiresAt: inDays(7), deliveryStatus: "failed" }, now)).toBe(
      "not_delivered"
    )
    // Not yet known (just created) reads as pending, never as sent.
    expect(invitationRowStatus({ expiresAt: inDays(7), deliveryStatus: "pending" }, now)).toBe(
      "pending"
    )
  })

  it("says when it expires, or expired", () => {
    expect(invitationStatusDetail({ expiresAt: inDays(6), deliveryStatus: "sent" }, now)).toBe(
      "Expires in 6 days"
    )
    expect(invitationStatusDetail({ expiresAt: inDays(-2), deliveryStatus: "sent" }, now)).toBe(
      "Expired 2 days ago"
    )
  })

  it("uses the right unit for relative times", () => {
    expect(relativeTime(new Date(inDays(1)), now)).toBe("tomorrow")
    expect(relativeTime(new Date(now.getTime() + 3 * 3_600_000), now)).toBe("in 3 hours")
    expect(relativeTime(new Date(now.getTime() + 20 * 60_000), now)).toBe("in 20 minutes")
    expect(relativeTime(new Date(inDays(-7)), now)).toBe("7 days ago")
  })
})
