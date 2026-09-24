import { describe, expect, it, vi } from "vitest"
import { createResendProvider, formatAddress } from "./resend"
import type { EmailMessage } from "./types"

const message: EmailMessage = {
  from: { email: "no-reply@mail.example.com", name: "DreamFunnels" },
  to: { email: "alex@example.com" },
  subject: "Hello",
  html: "<p>Hi</p>",
  text: "Hi",
  idempotencyKey: "invitation:123:abc",
  tags: { template: "workspace-invitation" },
}

const reply = (status: number, body: unknown) =>
  vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }))

describe("formatAddress", () => {
  it("adds the display name, quoting it when it has special characters", () => {
    expect(formatAddress({ email: "a@b.co" })).toBe("a@b.co")
    expect(formatAddress({ email: "a@b.co", name: "DreamFunnels" })).toBe("DreamFunnels <a@b.co>")
    expect(formatAddress({ email: "a@b.co", name: "Acme, Inc." })).toBe('"Acme, Inc." <a@b.co>')
  })

  it("can't be used to inject headers or break out of the quotes", () => {
    expect(formatAddress({ email: "a@b.co", name: 'Evil"\r\nBcc: x@y.z' })).toBe(
      '"EvilBcc: x@y.z" <a@b.co>'
    )
  })
})

describe("createResendProvider", () => {
  it("posts the message to Resend with the key and an idempotency key", async () => {
    const fetchMock = reply(200, { id: "email_123" })
    const provider = createResendProvider({ apiKey: "re_secret", fetch: fetchMock })

    await expect(provider.send(message)).resolves.toEqual({ ok: true, messageId: "email_123" })

    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe("https://api.resend.com/emails")
    expect(init?.method).toBe("POST")
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer re_secret",
      "Idempotency-Key": "invitation:123:abc",
    })
    expect(JSON.parse(String(init?.body))).toEqual({
      from: "DreamFunnels <no-reply@mail.example.com>",
      to: ["alex@example.com"],
      subject: "Hello",
      html: "<p>Hi</p>",
      text: "Hi",
      tags: [{ name: "template", value: "workspace-invitation" }],
    })
  })

  it.each([
    [422, "validation_error", "rejected"],
    [403, "validation_error", "misconfigured"],
    [401, "missing_api_key", "misconfigured"],
    [429, "rate_limit_exceeded", "rate_limited"],
    [409, "concurrent_idempotent_requests", "unavailable"],
    [500, "application_error", "unavailable"],
  ] as const)("maps HTTP %i (%s) to %s", async (status, name, reason) => {
    const provider = createResendProvider({
      apiKey: "re_secret",
      fetch: reply(status, { name, message: "alex@example.com is invalid" }),
    })
    const result = await provider.send(message)
    expect(result).toEqual({ ok: false, reason, status, code: name })
    // The provider's message can echo the recipient: it's never kept.
    expect(JSON.stringify(result)).not.toContain("alex@example.com")
  })

  it("reports network failures and timeouts as unavailable, without details", async () => {
    const provider = createResendProvider({
      apiKey: "re_secret",
      fetch: vi.fn<typeof fetch>(async () => {
        throw new Error("connect ECONNREFUSED with Bearer re_secret")
      }),
    })
    const result = await provider.send(message)
    expect(result).toEqual({ ok: false, reason: "unavailable" })
    expect(JSON.stringify(result)).not.toContain("re_secret")
  })

  it("ignores error names that aren't plain identifiers", async () => {
    const provider = createResendProvider({
      apiKey: "re_secret",
      fetch: reply(422, { name: "<script>" }),
    })
    expect(await provider.send(message)).toMatchObject({ code: undefined })
  })
})
