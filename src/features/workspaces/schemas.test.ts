import { describe, expect, it } from "vitest"
import { createWorkspaceSchema, updateWorkspaceSchema, workspaceSlugSchema } from "./schemas"

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
