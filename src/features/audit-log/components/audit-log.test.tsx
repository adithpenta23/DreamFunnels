import { render, screen, within } from "@testing-library/react"
import type { Route } from "next"
import { describe, expect, it, vi } from "vitest"
import { describeAuditEvent } from "../lib/events"
import { AuditLogFilters } from "./audit-log-filters"
import { AuditLogTable, type AuditLogRow } from "./audit-log-table"

// next/form needs the app router; a plain form is enough to test the fields.
vi.mock("next/form", () => ({
  default: ({ children, ...props }: React.ComponentProps<"form">) => (
    <form {...props}>{children}</form>
  ),
}))

const row = (overrides: Partial<AuditLogRow> = {}): AuditLogRow => ({
  ...describeAuditEvent({
    id: "7",
    createdAt: "2026-09-24T15:04:00Z",
    eventType: "workspace.ownership_transferred",
    actorName: "Adith",
    targetName: "Sarah",
    targetEmail: null,
    details: { from: "member", to: "owner", previous_owner_role: "admin" },
  }),
  key: "7",
  dateTime: "2026-09-24T15:04:00Z",
  dateLabel: "Sep 24, 2026, 10:04 AM",
  ...overrides,
})

describe("AuditLogTable", () => {
  it("shows date, actor, action, target and a sentence, with no ids or JSON", () => {
    render(<AuditLogTable rows={[row()]} caption="Audit log of ABC Roofing" />)
    const table = screen.getByRole("table", { name: "Audit log of ABC Roofing" })
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent)
    ).toEqual(["Date", "Actor", "Action", "Target", "Details"])
    const cells = within(table).getAllByRole("cell")
    expect(cells.map((cell) => cell.textContent)).toEqual([
      "Sep 24, 2026, 10:04 AM",
      "Adith",
      "Ownership transferred",
      "Sarah",
      "Ownership transferred. Sarah became workspace owner; Adith became admin.",
    ])
    expect(within(cells[0]!).getByText("Sep 24, 2026, 10:04 AM")).toHaveAttribute(
      "datetime",
      "2026-09-24T15:04:00Z"
    )
    expect(table.textContent).not.toMatch(/[{}]|"7"/)
  })
})

describe("AuditLogFilters", () => {
  const actors = [
    { userId: "6f1c1d0e-1a2b-4c3d-8e9f-0a1b2c3d4e5f", name: "Adith" },
    { userId: "0b0b0b0b-1a2b-4c3d-8e9f-0a1b2c3d4e5f", name: "Sarah" },
  ]

  it("labels every control and keeps the current filters", () => {
    render(
      <AuditLogFilters
        action={"/w/acme/settings/audit-log" as Route}
        params={{ action: "workspace.member_left", actor: actors[1]!.userId, from: "2026-09-01" }}
        actors={actors}
        dateError={null}
      />
    )
    const form = screen.getByRole("search", { name: "Filter the audit log" })
    expect(within(form).getByLabelText("Action")).toHaveValue("workspace.member_left")
    expect(within(form).getByLabelText("Done by")).toHaveValue(actors[1]!.userId)
    expect(within(form).getByLabelText("From")).toHaveValue("2026-09-01")
    expect(within(form).getByLabelText("To")).toHaveValue("")
    expect(within(form).getByRole("option", { name: "Ownership transferred" })).toBeInTheDocument()
    expect(within(form).getByRole("link", { name: "Clear" })).toHaveAttribute(
      "href",
      "/w/acme/settings/audit-log"
    )
  })

  it("marks an impossible date range on the field", () => {
    render(
      <AuditLogFilters
        action={"/w/acme/settings/audit-log" as Route}
        params={{ from: "2026-09-24", to: "2026-09-01" }}
        actors={actors}
        dateError="The start date is after the end date."
      />
    )
    const from = screen.getByLabelText("From")
    expect(from).toHaveAttribute("aria-invalid", "true")
    expect(from).toHaveAccessibleDescription("The start date is after the end date.")
  })

  it("offers no Clear link without filters", () => {
    render(
      <AuditLogFilters
        action={"/w/acme/settings/audit-log" as Route}
        params={{}}
        actors={actors}
        dateError={null}
      />
    )
    expect(screen.queryByRole("link", { name: "Clear" })).not.toBeInTheDocument()
  })
})
