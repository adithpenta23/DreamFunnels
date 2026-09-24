import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { CONFIG_PATH, OVERRIDES, setTomlValue } from "./enable-email-confirmation.mjs"

describe("setTomlValue", () => {
  const toml = [
    "[auth.email]",
    "enable_confirmations = false",
    "[auth.sms]",
    "enable_confirmations = false",
  ].join("\n")

  it("changes the key in its own section only", () => {
    expect(setTomlValue(toml, "auth.email", "enable_confirmations", "true")).toBe(
      [
        "[auth.email]",
        "enable_confirmations = true",
        "[auth.sms]",
        "enable_confirmations = false",
      ].join("\n")
    )
  })

  it("fails loudly when the key isn't in that section", () => {
    expect(() => setTomlValue(toml, "auth.rate_limit", "email_sent", "100")).toThrow(/not found/)
  })

  it("finds both keys in the committed config, which keeps the local defaults", () => {
    let config = readFileSync(CONFIG_PATH, "utf8")
    expect(config).toMatch(/^enable_confirmations = false$/m)
    expect(config).toMatch(/^email_sent = 2$/m)
    for (const { section, key, value } of OVERRIDES)
      config = setTomlValue(config, section, key, value)
    expect(config).toMatch(/\[auth\.email\][^[]*enable_confirmations = true/)
    expect(config).toMatch(/\[auth\.sms\][^[]*enable_confirmations = false/)
    expect(config).toMatch(/\[auth\.rate_limit\][^[]*email_sent = 100/)
  })
})
