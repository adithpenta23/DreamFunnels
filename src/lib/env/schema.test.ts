import { describe, expect, it } from "vitest"
import { EnvValidationError, parseDeploymentEnv, parsePublicEnv, parseServerEnv } from "./schema"

const validPublicEnv = {
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
}

describe("parsePublicEnv", () => {
  it("accepts a minimal valid environment", () => {
    expect(parsePublicEnv(validPublicEnv)).toEqual(validPublicEnv)
  })

  it("treats empty strings as unset so optional integrations stay disabled", () => {
    const env = parsePublicEnv({
      ...validPublicEnv,
      NEXT_PUBLIC_POSTHOG_KEY: "",
      NEXT_PUBLIC_SENTRY_DSN: "",
    })
    expect(env.NEXT_PUBLIC_POSTHOG_KEY).toBeUndefined()
    expect(env.NEXT_PUBLIC_SENTRY_DSN).toBeUndefined()
  })

  it("lists every missing or invalid key", () => {
    const attempt = () =>
      parsePublicEnv({ NEXT_PUBLIC_APP_URL: "not a url", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "" })

    expect(attempt).toThrow(EnvValidationError)
    try {
      attempt()
    } catch (error) {
      const { issues } = error as EnvValidationError
      expect(issues.join("\n")).toMatch(/NEXT_PUBLIC_APP_URL/)
      expect(issues.join("\n")).toMatch(/NEXT_PUBLIC_SUPABASE_URL/)
      expect(issues.join("\n")).toMatch(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/)
    }
  })

  it("never echoes values in error messages", () => {
    const secretLookingValue = "sb_secret_do_not_print_me"
    let message = ""
    try {
      parsePublicEnv({ ...validPublicEnv, NEXT_PUBLIC_SUPABASE_URL: secretLookingValue })
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toMatch(/NEXT_PUBLIC_SUPABASE_URL/)
    expect(message).not.toContain(secretLookingValue)
  })
})

describe("parseServerEnv", () => {
  it("defaults NODE_ENV and leaves optional secrets unset", () => {
    const env = parseServerEnv({})
    expect(env.NODE_ENV).toBe("development")
    expect(env.SUPABASE_SECRET_KEY).toBeUndefined()
  })

  it("rejects unknown log levels", () => {
    expect(() => parseServerEnv({ LOG_LEVEL: "verbose" })).toThrow(/LOG_LEVEL/)
  })

  it("defaults to the local environment, where the CAPTCHA and secret key are optional", () => {
    const env = parseServerEnv({})
    expect(env.APP_ENV).toBe("local")
    expect(env.TURNSTILE_SECRET_KEY).toBeUndefined()
  })

  it("refuses to treat a Vercel deployment as local", () => {
    expect(() => parseServerEnv({ VERCEL_ENV: "production" })).toThrow(/APP_ENV/)
    expect(() => parseServerEnv({ VERCEL_ENV: "preview", APP_ENV: "local" })).toThrow(/APP_ENV/)
    expect(parseServerEnv({ VERCEL_ENV: "development" }).APP_ENV).toBe("local")
  })

  it.each(["staging", "production"])(
    "requires the secret key and CAPTCHA secret in %s",
    (appEnv) => {
      const attempt = () => parseServerEnv({ APP_ENV: appEnv })
      expect(attempt).toThrow(/SUPABASE_SECRET_KEY/)
      expect(attempt).toThrow(/TURNSTILE_SECRET_KEY/)
    }
  )
})

describe("parseDeploymentEnv", () => {
  const hosted = {
    NEXT_PUBLIC_APP_URL: "https://staging.dreamfunnels.example",
    NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnop.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: "0x4AAAAAAAexample",
    SUPABASE_SECRET_KEY: "sb_secret_test",
    TURNSTILE_SECRET_KEY: "0x4AAAAAAAexample-secret",
  }
  const issuesOf = (raw: Record<string, string | undefined>) => {
    try {
      parseDeploymentEnv(raw)
      return []
    } catch (error) {
      return [...(error as EnvValidationError).issues]
    }
  }

  it("accepts a local setup without CAPTCHA keys or a secret key", () => {
    expect(issuesOf(validPublicEnv)).toEqual([])
  })

  it("accepts a fully configured staging and production deployment", () => {
    expect(issuesOf({ ...hosted, APP_ENV: "staging", VERCEL_ENV: "preview" })).toEqual([])
    expect(issuesOf({ ...hosted, APP_ENV: "production", VERCEL_ENV: "production" })).toEqual([])
  })

  it("requires both Turnstile keys or neither, in every environment", () => {
    expect(
      issuesOf({ ...validPublicEnv, NEXT_PUBLIC_TURNSTILE_SITE_KEY: "0x4AAA" }).join()
    ).toMatch(/Set both Turnstile keys/)
    expect(issuesOf({ ...validPublicEnv, TURNSTILE_SECRET_KEY: "0x4AAA" }).join()).toMatch(
      /Set both Turnstile keys/
    )
  })

  it("lists every missing hosted setting at once", () => {
    const issues = issuesOf({ ...validPublicEnv, APP_ENV: "staging" }).join("\n")
    expect(issues).toMatch(/SUPABASE_SECRET_KEY/)
    expect(issues).toMatch(/TURNSTILE_SECRET_KEY/)
    expect(issues).toMatch(/NEXT_PUBLIC_TURNSTILE_SITE_KEY: Required/)
    expect(issues).toMatch(/NEXT_PUBLIC_APP_URL: Must use https/)
    expect(issues).toMatch(/NEXT_PUBLIC_SUPABASE_URL: Must use https/)
  })

  it("rejects a hosted deployment pointed at a local Supabase", () => {
    const issues = issuesOf({
      ...hosted,
      APP_ENV: "staging",
      NEXT_PUBLIC_SUPABASE_URL: "https://127.0.0.1:54321",
    })
    expect(issues.join()).toMatch(/NEXT_PUBLIC_SUPABASE_URL: Must not point at this machine/)
  })

  it("allows Cloudflare's test keys in staging but not in production", () => {
    const testKeys = {
      ...hosted,
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
      TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
    }
    expect(issuesOf({ ...testKeys, APP_ENV: "staging" })).toEqual([])
    const production = issuesOf({ ...testKeys, APP_ENV: "production" }).join("\n")
    expect(production).toMatch(/TURNSTILE_SECRET_KEY: Cloudflare's test secret/)
    expect(production).toMatch(/NEXT_PUBLIC_TURNSTILE_SITE_KEY: Cloudflare's test site key/)
  })

  it("never echoes secret values", () => {
    const secret = "sb_secret_do_not_print_me"
    const issues = issuesOf({
      ...hosted,
      APP_ENV: "production",
      SUPABASE_SECRET_KEY: secret,
      TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
    })
    expect(issues.length).toBeGreaterThan(0)
    expect(issues.join()).not.toContain(secret)
    expect(issues.join()).not.toContain("1x0000000000000000000000000000000AA")
  })
})
