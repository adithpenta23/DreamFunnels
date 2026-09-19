import { describe, expect, it } from "vitest"
import { hasSessionCookie } from "./session-cookie"

describe("hasSessionCookie", () => {
  it.each([
    ["a single session cookie", ["sb-127-auth-token"]],
    [
      "a chunked session cookie",
      ["theme", "sb-abcdefghijkl-auth-token.0", "sb-abcdefghijkl-auth-token.1"],
    ],
  ])("detects %s", (_label, names) => {
    expect(hasSessionCookie(names)).toBe(true)
  })

  it.each([
    ["no cookies", []],
    ["only the PKCE code verifier", ["sb-127-auth-token-code-verifier"]],
    ["unrelated cookies", ["df_last_workspace", "sb-127-other"]],
  ])("ignores %s", (_label, names) => {
    expect(hasSessionCookie(names)).toBe(false)
  })
})
