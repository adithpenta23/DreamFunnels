import { describe, expect, it } from "vitest"
import { E164_PATTERN, normalizePhone, optionalPhoneSchema } from "./phone"

describe("normalizePhone", () => {
  it.each([
    ["+1 (512) 555-0100", "+15125550100"],
    ["+44 20 7183 8750", "+442071838750"],
    ["0044 20 7183 8750", "+442071838750"],
    ["+91.98765.43210", "+919876543210"],
    ["  +61 2 9374 4000 ", "+61293744000"],
  ])("%j -> %j", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected)
    expect(expected).toMatch(E164_PATTERN)
  })
})

describe("optionalPhoneSchema", () => {
  it.each([undefined, null, "", "   "])("treats %j as no phone number", (input) => {
    expect(optionalPhoneSchema.parse(input)).toBeNull()
  })

  it("stores the E.164 form of what was typed", () => {
    expect(optionalPhoneSchema.parse("+1 512-555-0100")).toBe("+15125550100")
  })

  it.each([
    ["a national number without country code", "(512) 555-0100"],
    ["a leading zero after +", "+0123456789"],
    ["too few digits", "+1234"],
    ["too many digits", "+1234567890123456"],
    ["letters", "+1 512 CALL NOW"],
  ])("rejects %s, asking for the country code", (_label, input) => {
    const result = optionalPhoneSchema.safeParse(input)
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toMatch(/country code/)
  })
})
