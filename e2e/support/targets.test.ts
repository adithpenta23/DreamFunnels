import { describe, expect, it } from "vitest"
import {
  healthEnvironmentProblem,
  isLoopbackUrl,
  localTargetProblems,
  stagingTargetProblems,
} from "./targets"

describe("isLoopbackUrl", () => {
  it.each([
    "http://localhost:3000",
    "http://127.0.0.1:54321",
    "http://[::1]:3000",
    "http://app.localhost",
  ])("treats %s as this machine", (url) => expect(isLoopbackUrl(url)).toBe(true))
  it.each(["https://staging.example.com", "https://abc.supabase.co", "not a url"])(
    "treats %s as elsewhere",
    (url) => expect(isLoopbackUrl(url)).toBe(false)
  )
})

describe("localTargetProblems", () => {
  it("allows the local stack and the default base URL", () => {
    expect(localTargetProblems({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" })).toEqual([])
  })

  it("refuses a hosted Supabase project or a remote base URL", () => {
    expect(
      localTargetProblems({
        NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
        PLAYWRIGHT_BASE_URL: "https://app.example.com",
      })
    ).toHaveLength(2)
  })
})

describe("stagingTargetProblems", () => {
  const good = {
    STAGING_APP_URL: "https://staging.example.com",
    NEXT_PUBLIC_SUPABASE_URL: "https://staging-ref.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
    SUPABASE_SECRET_KEY: "sb_secret_x",
    PRODUCTION_APP_URL: "https://app.example.com",
    PRODUCTION_SUPABASE_URL: "https://prod-ref.supabase.co",
  }

  it("accepts a fully configured staging target", () => {
    expect(stagingTargetProblems(good)).toEqual([])
    expect(
      stagingTargetProblems({ ...good, PLAYWRIGHT_BASE_URL: "https://staging.example.com/" })
    ).toEqual([])
  })

  it("refuses production, by app URL or by Supabase project", () => {
    expect(
      stagingTargetProblems({ ...good, PLAYWRIGHT_BASE_URL: "https://app.example.com" })
    ).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/production/),
        expect.stringMatching(/exactly STAGING_APP_URL/),
      ])
    )
    expect(stagingTargetProblems({ ...good, STAGING_APP_URL: "https://app.example.com" })).toEqual(
      expect.arrayContaining([expect.stringMatching(/production/)])
    )
    expect(
      stagingTargetProblems({ ...good, NEXT_PUBLIC_SUPABASE_URL: "https://prod-ref.supabase.co" })
    ).toEqual([expect.stringMatching(/production project/)])
  })

  it("refuses anything other than the configured staging URL", () => {
    expect(
      stagingTargetProblems({ ...good, PLAYWRIGHT_BASE_URL: "https://preview-123.vercel.app" })
    ).toEqual([expect.stringMatching(/exactly STAGING_APP_URL/)])
  })

  it("needs https, a hosted project and the keys", () => {
    expect(stagingTargetProblems({})).toHaveLength(4)
    expect(
      stagingTargetProblems({
        ...good,
        STAGING_APP_URL: "http://localhost:3000",
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      })
    ).toEqual(
      expect.arrayContaining([
        "STAGING_APP_URL must use https.",
        "STAGING_APP_URL must not point at this machine.",
        expect.stringMatching(/hosted staging project/),
      ])
    )
  })
})

describe("healthEnvironmentProblem", () => {
  it("passes only when the app says it's staging", () => {
    expect(healthEnvironmentProblem({ status: "ok", environment: "staging" }, "staging")).toBeNull()
    expect(
      healthEnvironmentProblem({ status: "ok", environment: "production" }, "staging")
    ).toMatch(/"production"/)
    expect(healthEnvironmentProblem({ status: "ok" }, "staging")).toMatch(/null/)
    expect(healthEnvironmentProblem("nope", "staging")).toMatch(/refusing/)
  })
})
