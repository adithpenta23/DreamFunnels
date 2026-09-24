import { describe, expect, it } from "vitest"
import { renderEmailTemplate } from "."
import type { InvitationEmailVariables } from "./invitation"

const variables: InvitationEmailVariables = {
  invitedEmail: "alex@example.com",
  workspaceName: "ABC Roofing",
  inviterName: "John Smith",
  role: "admin",
  acceptUrl: "https://app.dreamfunnels.example/invite/tok_abc-123",
  expiresAt: new Date("2026-09-30T15:00:00Z"),
  timeZone: "America/Chicago",
  message: null,
}

const render = (overrides: Partial<InvitationEmailVariables> = {}) => {
  const result = renderEmailTemplate("workspace-invitation", { ...variables, ...overrides })
  if (!result.ok) throw new Error(`invalid: ${result.invalid.join(", ")}`)
  return result.email
}

describe("workspace invitation email", () => {
  it("names the inviter, the workspace and the role", () => {
    const email = render()
    expect(email.subject).toBe("John Smith invited you to join ABC Roofing on DreamFunnels")
    expect(email.html).toContain(
      "<strong>John Smith</strong> invited you to join <strong>ABC Roofing</strong> as an admin."
    )
    expect(email.text).toContain("John Smith invited you to join ABC Roofing as an admin.")
    expect(render({ role: "member" }).text).toContain("as a member.")
  })

  it("links to the accept page in the button, the fallback and the text version", () => {
    const email = render()
    expect(email.html).toContain('href="https://app.dreamfunnels.example/invite/tok_abc-123"')
    expect(email.html).toContain(">Accept invitation</a>")
    expect(email.text).toContain(
      "Accept the invitation: https://app.dreamfunnels.example/invite/tok_abc-123"
    )
  })

  it("shows the expiry date in the workspace's time zone, and the recipient", () => {
    const email = render({ expiresAt: new Date("2026-10-01T03:00:00Z") })
    // 03:00 UTC on Oct 1 is still Sept 30 in Chicago.
    expect(email.text).toContain("This invitation expires on September 30, 2026.")
    expect(email.html).toContain("<strong>September 30, 2026</strong>")
    expect(email.text).toContain("It was sent to alex@example.com.")
  })

  it("includes the personal message, escaped, keeping its line breaks", () => {
    const email = render({ message: "Welcome aboard!\nSee you <b>Monday</b>." })
    expect(email.html).toContain("Welcome aboard!\nSee you &lt;b&gt;Monday&lt;/b&gt;.")
    expect(email.html).toContain("white-space:pre-line")
    expect(email.text).toContain("> Welcome aboard!\n> See you <b>Monday</b>.\n> — John Smith")
  })

  it("escapes every value that ends up in HTML", () => {
    const email = render({
      workspaceName: `<script>alert("x")</script>`,
      inviterName: `Eve "the" <img src=x onerror=alert(1)>`,
    })
    expect(email.html).not.toContain("<script>")
    expect(email.html).not.toContain("<img")
    expect(email.html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;")
  })

  it.each([
    ["a missing workspace name", { workspaceName: "   " }, "workspaceName"],
    ["a missing inviter", { inviterName: "" }, "inviterName"],
    ["a non-http link", { acceptUrl: "javascript:alert(1)" }, "acceptUrl"],
    ["an owner role", { role: "owner" as "admin" }, "role"],
    ["an invalid recipient", { invitedEmail: "nope" }, "invitedEmail"],
    ["an unknown time zone", { timeZone: "-05:00" }, "timeZone"],
  ])("refuses to render with %s", (_label, overrides, path) => {
    const result = renderEmailTemplate("workspace-invitation", { ...variables, ...overrides })
    expect(result).toEqual({ ok: false, invalid: [path] })
  })

  it("refuses missing variables instead of printing 'undefined'", () => {
    const { acceptUrl: _dropped, ...partial } = variables
    const result = renderEmailTemplate(
      "workspace-invitation",
      partial as unknown as InvitationEmailVariables
    )
    expect(result).toEqual({ ok: false, invalid: ["acceptUrl"] })
  })
})
