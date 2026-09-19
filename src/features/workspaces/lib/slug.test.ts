import { describe, expect, it } from "vitest"
import {
  RESERVED_WORKSPACE_SLUGS,
  isValidWorkspaceSlug,
  slugify,
  suggestWorkspaceSlug,
} from "./slug"

// These cases are kept in lockstep with the create_workspace() tests in
// supabase/tests/tenancy-rls.test.ts, which exercise the SQL twin.
describe("slugify", () => {
  it.each([
    ["Acme Inc.", "acme-inc"],
    ["Café Münster & Co.", "cafe-munster-co"],
    ["  Blank Slug Studio  ", "blank-slug-studio"],
    ["Northwind---Traders", "northwind-traders"],
    ["ＡＢＣ Ｗｉｄｅ", "abc-wide"],
    ["日本語 !!!", ""],
    ["", ""],
  ])("turns %j into %j", (input, expected) => {
    expect(slugify(input)).toBe(expected)
  })
})

describe("suggestWorkspaceSlug", () => {
  it("suggests the slugified name", () => {
    expect(suggestWorkspaceSlug("Acme Rockets")).toBe("acme-rockets")
  })

  it("caps generated slugs at 40 characters without a trailing hyphen", () => {
    expect(suggestWorkspaceSlug("x".repeat(80))).toBe("x".repeat(40))
    expect(suggestWorkspaceSlug(`${"a".repeat(39)} tail`)).toBe("a".repeat(39))
  })

  it.each([
    ["too short", "AB"],
    ["reserved", "Admin"],
    ["without usable characters", "日本語"],
  ])("returns null when the name is %s (the database adds a random suffix)", (_label, name) => {
    expect(suggestWorkspaceSlug(name)).toBeNull()
  })
})

describe("isValidWorkspaceSlug", () => {
  it.each(["acme", "acme-inc", "a1b", "x".repeat(48)])("accepts %j", (slug) => {
    expect(isValidWorkspaceSlug(slug)).toBe(true)
  })

  it.each(["ab", "Bad Slug", "-leading", "trailing-", "UPPER", "x".repeat(49), "acme_inc"])(
    "rejects the malformed %j",
    (slug) => {
      expect(isValidWorkspaceSlug(slug)).toBe(false)
    }
  )

  it("rejects every reserved slug", () => {
    for (const slug of RESERVED_WORKSPACE_SLUGS) expect(isValidWorkspaceSlug(slug)).toBe(false)
  })
})
