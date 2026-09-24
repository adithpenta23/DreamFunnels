import { describe, expect, it } from "vitest"
import {
  AUDIT_EVENT_LABELS,
  AUDIT_EVENT_TYPES,
  describeAuditEvent,
  toAuditDetails,
  type AuditEvent,
} from "./events"

const event = (overrides: Partial<AuditEvent>): AuditEvent => ({
  id: "1",
  createdAt: "2026-09-24T10:00:00Z",
  eventType: "workspace.member_added",
  actorName: "Adith",
  targetName: "Sarah",
  targetEmail: null,
  details: {},
  ...overrides,
})

describe("describeAuditEvent", () => {
  it("words ownership transfer as the brief asks", () => {
    expect(
      describeAuditEvent(
        event({
          eventType: "workspace.ownership_transferred",
          details: { from: "member", to: "owner", previous_owner_role: "admin" },
        })
      ).sentence
    ).toBe("Sarah became workspace owner; Adith became admin.")
  })

  it.each([
    [
      {
        eventType: "workspace.member_invited",
        targetName: null,
        targetEmail: "sam@example.com",
        details: { role: "admin" },
      },
      "Adith invited sam@example.com to join as an admin.",
    ],
    [
      {
        eventType: "workspace.invitation_resent",
        targetName: null,
        targetEmail: "sam@example.com",
      },
      "Adith sent the invitation to sam@example.com again, with a new link.",
    ],
    [
      {
        eventType: "workspace.invitation_revoked",
        targetName: null,
        targetEmail: "sam@example.com",
      },
      "Adith cancelled the invitation to sam@example.com.",
    ],
    [
      {
        eventType: "workspace.invitation_accepted",
        actorName: "Sarah",
        details: { role: "member", method: "pending_list" },
      },
      "Sarah accepted the invitation from their pending invitations and joined as a member.",
    ],
    [
      {
        eventType: "workspace.invitation_accepted",
        details: { role: "admin", already_member: true },
      },
      "Sarah accepted an invitation but was already a member, so their role didn't change.",
    ],
    [
      { eventType: "workspace.member_added", details: { role: "owner" } },
      "Sarah became an owner of this workspace.",
    ],
    [
      { eventType: "workspace.member_removed", details: { role: "admin" } },
      "Adith removed Sarah (admin) from this workspace.",
    ],
    [
      { eventType: "workspace.member_role_changed", details: { from: "member", to: "admin" } },
      "Adith changed Sarah's role from member to admin.",
    ],
    [
      { eventType: "workspace.member_left", actorName: "Sarah", details: { role: "admin" } },
      "Sarah left this workspace (was an admin).",
    ],
    [
      { eventType: "workspace.owner_granted", details: { from: "admin", to: "owner" } },
      "Adith made Sarah an owner (previously an admin).",
    ],
    [
      {
        eventType: "workspace.client_created",
        targetName: null,
        details: { client_name: "ABC Roofing" },
      },
      "Adith created the client workspace ABC Roofing.",
    ],
    [
      { eventType: "workspace.client_created", targetName: null },
      "Adith created a client workspace that has since been deleted.",
    ],
  ] as const)("describes %o", (overrides, sentence) => {
    expect(describeAuditEvent(event(overrides as Partial<AuditEvent>)).sentence).toBe(sentence)
  })

  it("labels every event type, and handles unknown ones and missing people", () => {
    for (const type of AUDIT_EVENT_TYPES) {
      expect(describeAuditEvent(event({ eventType: type })).action).toBe(AUDIT_EVENT_LABELS[type])
    }
    const unknown = describeAuditEvent(event({ eventType: "workspace.future_thing" }))
    expect(unknown).toMatchObject({
      action: "Other change",
      sentence: "Adith made a change to this workspace.",
    })
    const nobody = describeAuditEvent(
      event({ eventType: "workspace.member_removed", actorName: null, targetName: null })
    )
    expect(nobody.sentence).toBe("System removed a former member (unknown) from this workspace.")
  })

  it("never renders ids or raw JSON", () => {
    const described = describeAuditEvent(
      event({
        eventType: "workspace.member_invited",
        details: toAuditDetails({ role: "member", invitation_id: "d3b07384-d9a0-4c9b" }),
      })
    )
    expect(JSON.stringify(described)).not.toContain("d3b07384")
  })
})

describe("toAuditDetails", () => {
  it("keeps only known keys with the right types", () => {
    expect(
      toAuditDetails({
        role: "admin",
        from: 1,
        already_member: "yes",
        client_name: "ABC",
        invitation_id: "x",
      })
    ).toEqual({ role: "admin", client_name: "ABC" })
    expect(toAuditDetails(null)).toEqual({})
    expect(toAuditDetails(["role"])).toEqual({})
  })
})
