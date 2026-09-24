import { describe, expect, it, vi } from "vitest"
import { createMailpitProvider, DEFAULT_MAILPIT_URL } from "./mailpit"

const message = {
  from: { email: "no-reply@dreamfunnels.test", name: "DreamFunnels" },
  to: { email: "alex@example.com" },
  subject: "Hello",
  html: "<p>Hi</p>",
  text: "Hi",
  tags: { template: "workspace-invitation" },
}

describe("createMailpitProvider", () => {
  it("sends through Mailpit's HTTP API on the local stack", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ ID: "abc123" }), { status: 200 })
    )
    const provider = createMailpitProvider({ fetch: fetchMock })

    await expect(provider.send(message)).resolves.toEqual({ ok: true, messageId: "abc123" })

    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(String(url)).toBe(`${DEFAULT_MAILPIT_URL}/api/v1/send`)
    expect(JSON.parse(String(init?.body))).toEqual({
      From: { Email: "no-reply@dreamfunnels.test", Name: "DreamFunnels" },
      To: [{ Email: "alex@example.com", Name: "" }],
      Subject: "Hello",
      HTML: "<p>Hi</p>",
      Text: "Hi",
      Tags: ["workspace-invitation"],
    })
  })

  it("reports Mailpit being down as unavailable", async () => {
    const provider = createMailpitProvider({
      url: "http://127.0.0.1:1",
      fetch: vi.fn<typeof fetch>(async () => {
        throw new TypeError("fetch failed")
      }),
    })
    await expect(provider.send(message)).resolves.toEqual({ ok: false, reason: "unavailable" })
  })

  it("reports a rejected request with its status", async () => {
    const provider = createMailpitProvider({
      fetch: vi.fn<typeof fetch>(async () => new Response("bad request", { status: 400 })),
    })
    await expect(provider.send(message)).resolves.toEqual({
      ok: false,
      reason: "rejected",
      status: 400,
    })
  })
})
