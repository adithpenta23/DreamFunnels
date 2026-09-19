import { describe, expect, it } from "vitest"
import { onboardingSchema } from "./schemas"

describe("onboardingSchema", () => {
  it("accepts a name and workspace, normalising the optional URL", () => {
    expect(
      onboardingSchema.parse({
        fullName: " Ada Lovelace ",
        workspaceName: " Analytical Engines ",
        workspaceSlug: " Engines ",
      })
    ).toEqual({
      fullName: "Ada Lovelace",
      workspaceName: "Analytical Engines",
      workspaceSlug: "engines",
    })
  })

  it("lets the URL be generated when left blank", () => {
    const result = onboardingSchema.parse({
      fullName: "Ada",
      workspaceName: "Engines",
      workspaceSlug: "",
    })
    expect(result.workspaceSlug).toBeUndefined()
  })

  it("reports every missing field at once", () => {
    const result = onboardingSchema.safeParse({ fullName: "", workspaceName: "" })
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => [issue.path[0], issue.message])).toEqual([
      ["fullName", "Enter your name."],
      ["workspaceName", "Enter a workspace name."],
    ])
  })

  it("rejects an invalid URL instead of silently generating one", () => {
    const result = onboardingSchema.safeParse({
      fullName: "Ada",
      workspaceName: "Engines",
      workspaceSlug: "no spaces allowed",
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(["workspaceSlug"])
  })
})
