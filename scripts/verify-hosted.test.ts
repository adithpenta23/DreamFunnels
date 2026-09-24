import { afterEach, describe, expect, it, vi } from "vitest"
import {
  checkAuthSettings,
  checkCallbackRejectsBadLink,
  checkEmailSignup,
  checkHealth,
  checkHostedUrl,
  checkHsts,
  checkInvitationPage,
  checkSecurityHeaders,
  checkSigningKeys,
  main,
  type Probe,
} from "./verify-hosted.mjs"

const APP = "https://staging.example.com"

const probe = (
  overrides: Partial<Omit<Probe, "headers">> & { headers?: Record<string, string> } = {}
): Probe => ({
  status: 200,
  body: "",
  setCookies: [],
  ...overrides,
  headers: new Headers(overrides.headers ?? {}),
})

const secureHeaders = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
}

describe("checkHostedUrl", () => {
  it("wants https on a real host", () => {
    expect(checkHostedUrl("App URL", APP).status).toBe("pass")
    expect(checkHostedUrl("App URL", "http://staging.example.com").status).toBe("fail")
    expect(checkHostedUrl("App URL", "https://127.0.0.1:3000").status).toBe("fail")
    expect(checkHostedUrl("App URL", undefined).status).toBe("fail")
    expect(checkHostedUrl("App URL", "nope").status).toBe("fail")
  })
})

describe("checkAuthSettings", () => {
  it("passes when Supabase requires email confirmation", () => {
    expect(checkAuthSettings({ mailer_autoconfirm: false, disable_signup: false }).status).toBe(
      "pass"
    )
  })

  it("fails, saying where to fix it, when sign-ups are auto-confirmed", () => {
    const result = checkAuthSettings({ mailer_autoconfirm: true })
    expect(result.status).toBe("fail")
    expect(result.detail).toMatch(/Confirm email/)
  })

  it.each([null, {}, "nope"])("fails on an unexpected response %j", (body) => {
    expect(checkAuthSettings(body).status).toBe("fail")
  })
})

describe("checkEmailSignup", () => {
  it("needs sign-ups on and the email provider enabled", () => {
    expect(checkEmailSignup({ disable_signup: false, external: { email: true } }).status).toBe(
      "pass"
    )
    expect(checkEmailSignup({ disable_signup: true, external: { email: true } }).status).toBe(
      "fail"
    )
    expect(checkEmailSignup({ disable_signup: false, external: { email: false } }).status).toBe(
      "fail"
    )
    expect(checkEmailSignup(null).status).toBe("fail")
  })
})

describe("checkSigningKeys", () => {
  it.each(["EC", "RSA", "OKP"])("passes with a published %s key", (kty) => {
    expect(checkSigningKeys({ keys: [{ kty, kid: "k1", alg: "ES256" }] }).status).toBe("pass")
  })

  it("fails with only the legacy shared secret (empty JWKS)", () => {
    const result = checkSigningKeys({ keys: [] })
    expect(result.status).toBe("fail")
    expect(result.detail).toMatch(/JWT Keys/)
  })

  it("never counts a symmetric key as asymmetric", () => {
    expect(checkSigningKeys({ keys: [{ kty: "oct" }] }).status).toBe("fail")
  })

  it("fails on a malformed response", () => {
    expect(checkSigningKeys({ keys: "none" }).status).toBe("fail")
  })
})

describe("checkHealth", () => {
  const healthy = (environment: string) =>
    probe({
      body: JSON.stringify({ status: "ok", environment, version: "abc1234" }),
      headers: { "cache-control": "no-store" },
    })

  it("passes a hosted app, and pins the environment when asked", () => {
    expect(checkHealth(healthy("staging"), undefined).status).toBe("pass")
    expect(checkHealth(healthy("staging"), "staging").status).toBe("pass")
    expect(checkHealth(healthy("staging"), "production").status).toBe("fail")
  })

  it("fails a local build, an error, non-JSON or a cacheable answer", () => {
    expect(checkHealth(healthy("local"), undefined).status).toBe("fail")
    expect(checkHealth(probe({ status: 503 }), undefined).status).toBe("fail")
    expect(checkHealth(probe({ body: "<html>" }), undefined).status).toBe("fail")
    expect(
      checkHealth(
        probe({ body: JSON.stringify({ status: "ok", environment: "staging" }) }),
        undefined
      ).detail
    ).toMatch(/cacheable/)
  })
})

describe("checkSecurityHeaders and checkHsts", () => {
  it("passes the app's headers", () => {
    expect(checkSecurityHeaders(probe({ headers: secureHeaders }), "/").status).toBe("pass")
  })

  it("names every missing or wrong header, and X-Powered-By", () => {
    const result = checkSecurityHeaders(
      probe({
        headers: { ...secureHeaders, "x-frame-options": "SAMEORIGIN", "x-powered-by": "Next.js" },
      }),
      "/"
    )
    expect(result.status).toBe("fail")
    expect(result.detail).toMatch(/x-frame-options/)
    expect(result.detail).toMatch(/x-powered-by/)
  })

  it("only warns without HSTS", () => {
    expect(checkHsts(probe()).status).toBe("warn")
    expect(
      checkHsts(probe({ headers: { "strict-transport-security": "max-age=63072000" } })).status
    ).toBe("pass")
  })
})

describe("checkCallbackRejectsBadLink", () => {
  const redirect = (location: string, setCookies: string[] = []) =>
    probe({ status: 307, headers: { location }, setCookies })

  it("passes a same-site redirect to the login error without a session", () => {
    expect(
      checkCallbackRejectsBadLink(redirect("/login?error=auth_callback_failed"), APP).status
    ).toBe("pass")
    // Clearing a cookie isn't setting a session.
    expect(
      checkCallbackRejectsBadLink(
        redirect(`${APP}/login?error=auth_callback_failed`, ["sb-ref-auth-token=; Max-Age=0"]),
        APP
      ).status
    ).toBe("pass")
  })

  it("fails anything else", () => {
    expect(checkCallbackRejectsBadLink(probe({ status: 200 }), APP).status).toBe("fail")
    expect(checkCallbackRejectsBadLink(redirect("https://evil.example/login"), APP).status).toBe(
      "fail"
    )
    expect(checkCallbackRejectsBadLink(redirect("/dashboard"), APP).status).toBe("fail")
    expect(
      checkCallbackRejectsBadLink(
        redirect("/login?error=auth_callback_failed", ["sb-ref-auth-token.0=base64-abc; Path=/"]),
        APP
      ).detail
    ).toMatch(/session cookie/)
  })
})

describe("checkInvitationPage", () => {
  const page = '<meta name="robots" content="noindex, nofollow"/>'

  it("wants an uncached, noindex page", () => {
    expect(
      checkInvitationPage(
        probe({ body: page, headers: { "cache-control": "private, no-cache, no-store" } })
      ).status
    ).toBe("pass")
    expect(
      checkInvitationPage(probe({ body: page, headers: { "cache-control": "public, max-age=60" } }))
        .status
    ).toBe("fail")
    expect(
      checkInvitationPage(probe({ body: "", headers: { "cache-control": "no-store" } })).status
    ).toBe("fail")
  })
})

describe("main", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("refuses to run without the target's URLs and key", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    expect(await main({}, [])).toBe(1)
    expect(
      await main(
        {
          NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "k",
        },
        []
      )
    ).toBe(1)
  })

  it("passes a healthy staging deployment, and fails it when confirmation is off; never printing the key", async () => {
    const logs: string[] = []
    vi.spyOn(console, "log").mockImplementation((line: string) => logs.push(line))
    let autoconfirm = false
    vi.stubGlobal("fetch", async (input: string | URL) => {
      const url = new URL(String(input))
      const json = (body: unknown, headers: Record<string, string> = {}) =>
        new Response(JSON.stringify(body), {
          headers: { "content-type": "application/json", ...headers },
        })
      if (url.pathname === "/auth/v1/settings") {
        return json({
          mailer_autoconfirm: autoconfirm,
          disable_signup: false,
          external: { email: true },
        })
      }
      if (url.pathname === "/auth/v1/.well-known/jwks.json") return json({ keys: [{ kty: "EC" }] })
      if (url.pathname === "/api/health") {
        return json({ status: "ok", environment: "staging" }, { "cache-control": "no-store" })
      }
      if (url.pathname === "/auth/callback") {
        return new Response(null, {
          status: 307,
          headers: { location: "/login?error=auth_callback_failed" },
        })
      }
      if (url.pathname.startsWith("/invite/")) {
        return new Response('<meta name="robots" content="noindex"/>', {
          headers: { "cache-control": "private, no-cache, no-store" },
        })
      }
      return new Response("<html></html>", {
        headers: { ...secureHeaders, "strict-transport-security": "max-age=63072000" },
      })
    })
    const env = {
      NEXT_PUBLIC_SUPABASE_URL: "https://staging-ref.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_SECRETISH",
      NEXT_PUBLIC_APP_URL: APP,
      VERIFY_EXPECT_APP_ENV: "staging",
    }

    expect(await main(env, [])).toBe(0)
    expect(logs.filter((line) => line.startsWith("PASS"))).toHaveLength(10)

    autoconfirm = true
    logs.length = 0
    expect(await main(env, [])).toBe(1)
    expect(logs.some((line) => line.startsWith("FAIL  Email confirmation required"))).toBe(true)
    expect(logs.join("\n")).not.toContain("SECRETISH")
  })
})
