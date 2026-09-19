import { describe, expect, it } from "vitest"
import { buildAuthCallbackUrl } from "./callback-url"

describe("buildAuthCallbackUrl", () => {
  it("points email links at the callback with a next step", () => {
    expect(buildAuthCallbackUrl("https://app.example.com", "/reset-password")).toBe(
      "https://app.example.com/auth/callback?next=%2Freset-password"
    )
  })

  it("ignores any path on the app URL", () => {
    expect(buildAuthCallbackUrl("http://localhost:3000/some/page", "/dashboard")).toBe(
      "http://localhost:3000/auth/callback?next=%2Fdashboard"
    )
  })

  it("never embeds an unsafe next target", () => {
    expect(buildAuthCallbackUrl("https://app.example.com", "https://evil.example")).toBe(
      "https://app.example.com/auth/callback?next=%2Fdashboard"
    )
  })
})
