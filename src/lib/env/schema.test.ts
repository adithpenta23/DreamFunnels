import { describe, expect, it } from "vitest"
import { EnvValidationError, parsePublicEnv, parseServerEnv } from "./schema"

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
})
