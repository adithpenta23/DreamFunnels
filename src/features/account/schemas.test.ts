import { describe, expect, it } from "vitest"
import { updateProfileSchema } from "./schemas"

describe("updateProfileSchema", () => {
  it("trims the name", () => {
    expect(updateProfileSchema.parse({ fullName: "  Ada Lovelace " })).toEqual({
      fullName: "Ada Lovelace",
    })
  })

  it.each([
    [undefined, "Enter your name."],
    ["", "Enter your name."],
    ["    ", "Enter your name."],
    ["x".repeat(121), "Use 120 characters or fewer."],
  ])("rejects %j", (fullName, message) => {
    const result = updateProfileSchema.safeParse({ fullName })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(message)
  })
})
