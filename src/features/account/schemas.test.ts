import { describe, expect, it } from "vitest"
import { updateProfileSchema } from "./schemas"

const valid = { fullName: "Ada Lovelace", phone: "", timezone: "UTC", locale: "en-US" }

describe("updateProfileSchema", () => {
  it("trims the name and treats a blank phone as none", () => {
    expect(updateProfileSchema.parse({ ...valid, fullName: "  Ada Lovelace " })).toEqual({
      fullName: "Ada Lovelace",
      phone: null,
      timezone: "UTC",
      locale: "en-US",
    })
  })

  it.each([
    [undefined, "Enter your name."],
    ["", "Enter your name."],
    ["    ", "Enter your name."],
    ["x".repeat(121), "Use 120 characters or fewer."],
  ])("rejects the name %j", (fullName, message) => {
    const result = updateProfileSchema.safeParse({ ...valid, fullName })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(message)
  })

  it("stores the phone in E.164 and the time zone canonically", () => {
    expect(
      updateProfileSchema.parse({
        ...valid,
        phone: "+44 20 7183 8750",
        timezone: "Asia/Calcutta",
        locale: "en-GB",
      })
    ).toMatchObject({ phone: "+442071838750", timezone: "Asia/Kolkata", locale: "en-GB" })
  })

  it.each([
    ["phone", "555 0100", /country code/],
    ["timezone", "-5", /time zone/],
    ["timezone", undefined, /time zone/],
    ["locale", "klingon", /format/],
  ])("rejects %s = %j", (field, value, message) => {
    const result = updateProfileSchema.safeParse({ ...valid, [field]: value })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual([field])
    expect(result.error?.issues[0]?.message).toMatch(message)
  })
})
