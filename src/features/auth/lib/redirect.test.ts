import { describe, expect, it } from "vitest"
import { getSafeRedirectPath } from "./redirect"

describe("getSafeRedirectPath", () => {
  it.each([
    ["/dashboard", "/dashboard"],
    ["/w/acme?tab=funnels#top", "/w/acme?tab=funnels#top"],
    ["/w/acme/../dashboard", "/w/dashboard"],
  ])("allows the same-origin path %j", (input, expected) => {
    expect(getSafeRedirectPath(input)).toBe(expected)
  })

  it.each([
    ["protocol-relative URL", "//evil.example"],
    ["absolute URL", "https://evil.example/dashboard"],
    ["backslash trick", "/\\evil.example"],
    ["javascript URL", "javascript:alert(1)"],
    ["relative path", "dashboard"],
    ["embedded tab", "/\t/evil.example"],
    ["embedded newline", "/\n/evil.example"],
    ["empty string", ""],
  ])("rejects a %s", (_label, input) => {
    expect(getSafeRedirectPath(input)).toBe("/dashboard")
  })

  it("rejects non-string input and honours a custom fallback", () => {
    expect(getSafeRedirectPath(undefined)).toBe("/dashboard")
    expect(getSafeRedirectPath(null, "/")).toBe("/")
    expect(getSafeRedirectPath(["/dashboard"], "/")).toBe("/")
  })
})
