import { describe, expect, it } from "vitest"
import { COUNTRY_CODES, countryOptions, isCountryCode } from "./countries"

describe("COUNTRY_CODES", () => {
  it("holds the 249 ISO 3166-1 alpha-2 codes, each once", () => {
    expect(COUNTRY_CODES).toHaveLength(249)
    expect(new Set(COUNTRY_CODES).size).toBe(249)
    for (const code of COUNTRY_CODES) expect(code).toMatch(/^[A-Z]{2}$/)
  })

  it("recognises codes, not names or lowercase", () => {
    expect(isCountryCode("US")).toBe(true)
    expect(isCountryCode("us")).toBe(false)
    expect(isCountryCode("USA")).toBe(false)
    expect(isCountryCode("XX")).toBe(false)
  })
})

describe("countryOptions", () => {
  it("names every country and sorts by name", () => {
    const options = countryOptions()
    expect(options).toHaveLength(249)
    expect(options.find((option) => option.value === "US")?.label).toBe("United States")
    const labels = options.map((option) => option.label)
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b, "en-US")))
  })
})
