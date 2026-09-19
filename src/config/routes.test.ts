import { describe, expect, it } from "vitest"
import {
  GUEST_ONLY_PATH_PREFIXES,
  PROTECTED_PATH_PREFIXES,
  matchesPathPrefix,
  routes,
} from "./routes"

describe("matchesPathPrefix", () => {
  it.each([
    "/dashboard",
    "/onboarding",
    "/workspaces/new",
    "/w",
    "/w/acme",
    "/w/acme/settings/account",
  ])("treats %j as protected", (path) => {
    expect(matchesPathPrefix(path, PROTECTED_PATH_PREFIXES)).toBe(true)
  })

  it.each(["/", "/login", "/signup", "/reset-password", "/dashboards", "/web", "/auth/callback"])(
    "does not treat %j as protected",
    (path) => {
      expect(matchesPathPrefix(path, PROTECTED_PATH_PREFIXES)).toBe(false)
    }
  )

  it.each(["/login", "/signup", "/forgot-password"])("treats %j as guest-only", (path) => {
    expect(matchesPathPrefix(path, GUEST_ONLY_PATH_PREFIXES)).toBe(true)
  })

  it("keeps the password reset page reachable for recovery sessions", () => {
    expect(matchesPathPrefix(routes.resetPassword, GUEST_ONLY_PATH_PREFIXES)).toBe(false)
    expect(matchesPathPrefix(routes.resetPassword, PROTECTED_PATH_PREFIXES)).toBe(false)
  })
})

describe("workspace routes", () => {
  it("builds encoded workspace paths", () => {
    expect(routes.workspace("acme")).toBe("/w/acme")
    expect(routes.workspace("a/b")).toBe("/w/a%2Fb")
    expect(routes.workspaceSettings("acme")).toBe("/w/acme/settings")
    expect(routes.accountSettings("acme")).toBe("/w/acme/settings/account")
  })
})
