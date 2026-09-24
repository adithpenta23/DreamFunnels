import { describe, expect, it } from "vitest"
import { parseAuditLogParams } from "./schemas"

describe("parseAuditLogParams", () => {
  it("keeps valid filters and the cursor", () => {
    expect(
      parseAuditLogParams({
        action: "workspace.member_left",
        actor: "6f1c1d0e-1a2b-4c3d-8e9f-0a1b2c3d4e5f",
        from: "2026-09-01",
        to: "2026-09-24",
        before: "1234",
      })
    ).toEqual({
      params: {
        action: "workspace.member_left",
        actor: "6f1c1d0e-1a2b-4c3d-8e9f-0a1b2c3d4e5f",
        from: "2026-09-01",
        to: "2026-09-24",
        before: "1234",
      },
      dateError: null,
    })
  })

  it("drops malformed values instead of failing the page", () => {
    expect(
      parseAuditLogParams({
        action: "workspace.dropped_tables",
        actor: "not-a-uuid",
        from: "yesterday",
        to: "",
        before: "-1; drop",
      }).params
    ).toEqual({
      action: undefined,
      actor: undefined,
      from: undefined,
      to: undefined,
      before: undefined,
    })
  })

  it("uses the first of repeated parameters", () => {
    expect(parseAuditLogParams({ before: ["5", "6"] }).params.before).toBe("5")
  })

  it("reports a range that ends before it starts", () => {
    expect(parseAuditLogParams({ from: "2026-09-24", to: "2026-09-01" }).dateError).toBe(
      "The start date is after the end date."
    )
  })
})
