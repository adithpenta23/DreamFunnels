import { describe, expect, it } from "vitest"
import { getAuthRedirect, type AuthRoutingInput } from "./auth-routing"

const request = (overrides: Partial<AuthRoutingInput>): AuthRoutingInput => ({
  method: "GET",
  pathname: "/",
  search: "",
  next: null,
  isSignedIn: false,
  sessionExpired: false,
  ...overrides,
})

describe("getAuthRedirect", () => {
  describe("signed-out visitors", () => {
    it("are sent to login from protected pages, remembering where they were going", () => {
      expect(getAuthRedirect(request({ pathname: "/w/acme/settings", search: "?tab=1" }))).toBe(
        "/login?next=%2Fw%2Facme%2Fsettings%3Ftab%3D1"
      )
      expect(getAuthRedirect(request({ pathname: "/onboarding" }))).toBe(
        "/login?next=%2Fonboarding"
      )
    })

    it("are told when their session expired", () => {
      expect(getAuthRedirect(request({ pathname: "/dashboard", sessionExpired: true }))).toBe(
        "/login?next=%2Fdashboard&reason=session_expired"
      )
    })

    it.each(["/", "/login", "/signup", "/forgot-password", "/reset-password", "/auth/callback"])(
      "can open %j",
      (pathname) => {
        expect(getAuthRedirect(request({ pathname }))).toBeNull()
      }
    )
  })

  describe("signed-in users", () => {
    it.each(["/login", "/signup", "/forgot-password"])(
      "skip the guest-only page %j and land on the dashboard",
      (pathname) => {
        expect(getAuthRedirect(request({ pathname, isSignedIn: true }))).toBe("/dashboard")
      }
    )

    it("are sent to a safe `next` target instead, when one is given", () => {
      expect(
        getAuthRedirect(request({ pathname: "/login", next: "/w/acme", isSignedIn: true }))
      ).toBe("/w/acme")
      expect(
        getAuthRedirect(request({ pathname: "/login", next: "//evil.example", isSignedIn: true }))
      ).toBe("/dashboard")
    })

    it.each(["/dashboard", "/w/acme", "/reset-password"])("can open %j", (pathname) => {
      expect(getAuthRedirect(request({ pathname, isSignedIn: true }))).toBeNull()
    })
  })

  it.each(["POST", "PUT", "DELETE"])(
    "never redirects %s requests (Server Actions re-check the session themselves)",
    (method) => {
      expect(getAuthRedirect(request({ method, pathname: "/w/acme/settings" }))).toBeNull()
      expect(getAuthRedirect(request({ method, pathname: "/login", isSignedIn: true }))).toBeNull()
    }
  )
})
