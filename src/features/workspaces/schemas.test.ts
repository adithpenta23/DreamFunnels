import { describe, expect, it } from "vitest"
import {
  clientListParamsSchema,
  createClientSchema,
  createWorkspaceSchema,
  updateWorkspaceProfileSchema,
  updateWorkspaceSchema,
  workspaceSlugSchema,
} from "./schemas"

const workspaceId = "6f1c1d0e-1a2b-4c3d-8e9f-0a1b2c3d4e5f"

function firstError(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.success ? undefined : result.error?.issues[0]?.message
}

describe("workspaceSlugSchema", () => {
  it("normalises what people type", () => {
    expect(workspaceSlugSchema.parse("  Acme-Inc ")).toBe("acme-inc")
  })

  it.each(["acme", "acme-inc", "a1b", "x".repeat(48)])("accepts %j", (slug) => {
    expect(workspaceSlugSchema.safeParse(slug).success).toBe(true)
  })

  it.each([
    ["ab", /3–48 lowercase letters/],
    ["acme inc", /3–48 lowercase letters/],
    ["-leading", /3–48 lowercase letters/],
    ["trailing-", /3–48 lowercase letters/],
    ["acme_inc", /3–48 lowercase letters/],
    ["x".repeat(49), /3–48 lowercase letters/],
    ["", /Enter a workspace URL/],
    ["www", /reserved/],
    ["Settings", /reserved/],
  ])("rejects %j", (slug, message) => {
    expect(firstError(workspaceSlugSchema.safeParse(slug))).toMatch(message)
  })
})

describe("createWorkspaceSchema", () => {
  it("accepts a name with a chosen URL", () => {
    expect(
      createWorkspaceSchema.parse({ workspaceName: " Acme Inc ", workspaceSlug: "Acme" })
    ).toEqual({ workspaceName: "Acme Inc", workspaceSlug: "acme" })
  })

  it.each([undefined, null, "", "   "])(
    "treats a URL of %j as 'generate one from the name'",
    (workspaceSlug) => {
      expect(createWorkspaceSchema.parse({ workspaceName: "Acme", workspaceSlug })).toEqual({
        workspaceName: "Acme",
        workspaceSlug: undefined,
      })
    }
  )

  it.each([
    [{ workspaceName: "" }, "Enter a workspace name."],
    [{ workspaceName: "   " }, "Enter a workspace name."],
    [{ workspaceName: "x".repeat(81) }, "Use 80 characters or fewer."],
    [
      { workspaceName: "Acme", workspaceSlug: "admin" },
      "That URL is reserved. Please choose another.",
    ],
  ])("rejects %j", (input, message) => {
    expect(firstError(createWorkspaceSchema.safeParse(input))).toBe(message)
  })
})

describe("updateWorkspaceSchema", () => {
  it("requires a well-formed workspace id, name and URL", () => {
    expect(
      updateWorkspaceSchema.safeParse({ workspaceId, workspaceName: "Acme", workspaceSlug: "acme" })
        .success
    ).toBe(true)
    expect(
      firstError(
        updateWorkspaceSchema.safeParse({
          workspaceId: "not-a-uuid",
          workspaceName: "Acme",
          workspaceSlug: "acme",
        })
      )
    ).toBe("Unknown workspace.")
  })

  it("does not allow clearing the URL", () => {
    expect(
      firstError(
        updateWorkspaceSchema.safeParse({ workspaceId, workspaceName: "Acme", workspaceSlug: "" })
      )
    ).toBe("Enter a workspace URL.")
  })
})

describe("updateWorkspaceProfileSchema", () => {
  const blank = {
    workspaceId,
    timezone: "UTC",
    businessName: "",
    businessEmail: "",
    businessPhone: "",
    websiteUrl: "",
    addressLine1: "",
    addressLine2: "",
    addressCity: "",
    addressRegion: "",
    addressPostalCode: "",
    addressCountry: "",
    logoUrl: "",
    brandPrimaryColor: "",
    brandSecondaryColor: "",
  }

  it("turns blank (and missing) fields into null, never empty strings", () => {
    const parsed = updateWorkspaceProfileSchema.parse({ workspaceId, timezone: "UTC" })
    expect(parsed).toEqual({
      ...blank,
      ...Object.fromEntries(Object.keys(blank).map((key) => [key, null])),
      workspaceId,
      timezone: "UTC",
    })
    expect(
      updateWorkspaceProfileSchema.parse({ ...blank, businessName: "   " }).businessName
    ).toBeNull()
  })

  it("normalises what people type into what the database stores", () => {
    expect(
      updateWorkspaceProfileSchema.parse({
        ...blank,
        timezone: "Asia/Calcutta",
        businessName: "  Acme Roofing  ",
        businessEmail: " Hello@Acme.EXAMPLE ",
        businessPhone: "+1 (512) 555-0100",
        addressCountry: "us",
        logoUrl: "https://cdn.example.com/logo.png",
        brandPrimaryColor: "1D4ED8",
        brandSecondaryColor: "#F59E0B",
      })
    ).toMatchObject({
      timezone: "Asia/Kolkata",
      businessName: "Acme Roofing",
      businessEmail: "hello@acme.example",
      businessPhone: "+15125550100",
      addressCountry: "US",
      logoUrl: "https://cdn.example.com/logo.png",
      brandPrimaryColor: "#1d4ed8",
      brandSecondaryColor: "#f59e0b",
    })
  })

  it.each([
    ["timezone", "-5", /time zone/],
    ["timezone", undefined, /time zone/],
    ["businessName", "x".repeat(121), /120 characters/],
    ["businessEmail", "not-an-email", /valid email/],
    ["businessPhone", "(512) 555-0100", /country code/],
    ["addressPostalCode", "x".repeat(21), /20 characters/],
    ["addressCountry", "USA", /country/],
    ["logoUrl", "http://example.com/logo.png", /https/],
    ["logoUrl", "javascript:alert(1)", /https/],
    ["logoUrl", "https://example.com/my logo.png", /spaces/],
    ["brandPrimaryColor", "#fff", /hex color/],
    ["brandSecondaryColor", "red", /hex color/],
  ])("rejects %s = %j on its field", (field, value, message) => {
    const result = updateWorkspaceProfileSchema.safeParse({ ...blank, [field]: value })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual([field])
    expect(result.error?.issues[0]?.message).toMatch(message)
  })
})

describe("createClientSchema", () => {
  const agencyId = "6f1c1d0e-1a2b-4c3d-8e9f-0a1b2c3d4e5f"
  const minimal = { agencyId, businessName: "ABC Roofing LLC", timezone: "America/Chicago" }

  it("needs only a business name and time zone; the workspace is named after the business", () => {
    const parsed = createClientSchema.parse(minimal)
    expect(parsed).toMatchObject({
      agencyId,
      businessName: "ABC Roofing LLC",
      workspaceName: "ABC Roofing LLC",
      timezone: "America/Chicago",
      businessEmail: null,
      websiteUrl: null,
      ownerEmail: null,
      ownerRole: "admin",
    })
    // No URL chosen: the database generates one.
    expect(parsed.workspaceSlug).toBeUndefined()
  })

  it("cuts a long business name to fit the workspace name", () => {
    const parsed = createClientSchema.parse({ ...minimal, businessName: "B".repeat(120) })
    expect(parsed.workspaceName).toHaveLength(80)
  })

  it("keeps a chosen workspace name and URL", () => {
    const parsed = createClientSchema.parse({
      ...minimal,
      workspaceName: "ABC (Austin)",
      workspaceSlug: " ABC-Austin ",
    })
    expect(parsed.workspaceName).toBe("ABC (Austin)")
    expect(parsed.workspaceSlug).toBe("abc-austin")
  })

  it("requires the business name, and validates the rest like the business profile", () => {
    const result = createClientSchema.safeParse({
      agencyId,
      businessName: "  ",
      timezone: "-05:00",
      businessPhone: "555-0100",
      ownerEmail: "not-an-email",
      ownerRole: "owner",
    })
    const fields = result.error?.issues.map((issue) => issue.path[0])
    expect(fields).toEqual(
      expect.arrayContaining([
        "businessName",
        "timezone",
        "businessPhone",
        "ownerEmail",
        "ownerRole",
      ])
    )
  })

  it("normalises the invitee's address", () => {
    expect(
      createClientSchema.parse({ ...minimal, ownerEmail: " Owner@ABC.example " }).ownerEmail
    ).toBe("owner@abc.example")
  })
})

describe("website addresses", () => {
  const parseWebsite = (websiteUrl: string) =>
    updateWorkspaceProfileSchema.safeParse({ workspaceId, timezone: "UTC", websiteUrl })

  it("accepts http and https, and reads a bare domain as https", () => {
    expect(parseWebsite("abcroofing.com").data?.websiteUrl).toBe("https://abcroofing.com")
    expect(parseWebsite("http://abcroofing.com").data?.websiteUrl).toBe("http://abcroofing.com")
    expect(parseWebsite("").data?.websiteUrl).toBeNull()
  })

  it("rejects other schemes and anything with spaces", () => {
    expect(parseWebsite("javascript:alert(1)").success).toBe(false)
    expect(parseWebsite("ftp://files.example.com").success).toBe(false)
    expect(parseWebsite("https://abc roofing.com").success).toBe(false)
  })
})

describe("clientListParamsSchema", () => {
  it("reads the search and page from the URL, falling back on nonsense", () => {
    expect(clientListParamsSchema.parse({})).toEqual({ q: undefined, page: 1 })
    expect(clientListParamsSchema.parse({ q: " roof ", page: "3" })).toEqual({ q: "roof", page: 3 })
    expect(clientListParamsSchema.parse({ q: ["a", "b"], page: "-1" })).toEqual({
      q: undefined,
      page: 1,
    })
    expect(clientListParamsSchema.parse({ page: "abc" }).page).toBe(1)
  })
})
