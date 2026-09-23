import { fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { beforeEach, describe, expect, it } from "vitest"
import { SearchableSelect, type SelectOption } from "./searchable-select"

const zones: SelectOption[] = [
  { value: "America/New_York", label: "Eastern Time — New York", description: "America/New_York" },
  { value: "America/Chicago", label: "Central Time — Chicago", description: "America/Chicago" },
  {
    value: "America/Sao_Paulo",
    label: "Brasilia Time — São Paulo",
    description: "America/Sao_Paulo",
  },
  { value: "Asia/Kolkata", label: "India Standard Time — Kolkata", keywords: "GMT+5:30" },
]

function Harness({ initial = "America/New_York" }: { initial?: string | null }) {
  const [value, setValue] = useState<string | null>(initial)
  return (
    <form aria-label="Settings">
      <label htmlFor="tz">Time zone</label>
      <SearchableSelect
        id="tz"
        name="timezone"
        options={zones}
        value={value}
        onValueChange={setValue}
        clearable
      />
      <output>{value ?? "none"}</output>
    </form>
  )
}

// While the list is open, Base UI hides the rest of the page from assistive
// tech (so role queries skip the input): keep a direct reference.
let field: HTMLElement
const input = () => field

/**
 * Types a query and opens the list. jsdom's synthetic typing doesn't open the
 * popup (real keyboards do; the E2E suite covers that), so press ArrowDown.
 */
function search(text: string) {
  input().focus()
  fireEvent.change(input(), { target: { value: text } })
  fireEvent.keyDown(input(), { key: "ArrowDown" })
}

describe("SearchableSelect", () => {
  beforeEach(() => {
    render(<Harness />)
    field = screen.getByRole("combobox", { name: "Time zone" })
  })

  it("shows the selected option's label and submits its value", () => {
    expect(input()).toHaveValue("Eastern Time — New York")
    const form = screen.getByRole("form", { name: "Settings" }) as HTMLFormElement
    expect(new FormData(form).get("timezone")).toBe("America/New_York")
  })

  it("filters by any word of the label, the IANA id or keywords, ignoring accents", async () => {
    search("sao paulo")
    expect(await screen.findByRole("option", { name: /São Paulo/ })).toBeInTheDocument()
    expect(screen.queryByRole("option", { name: /Chicago/ })).not.toBeInTheDocument()

    fireEvent.change(input(), { target: { value: "america chicago" } })
    expect(await screen.findByRole("option", { name: /Chicago/ })).toBeInTheDocument()
    expect(screen.getAllByRole("option")).toHaveLength(1)

    fireEvent.change(input(), { target: { value: "5:30" } })
    expect(await screen.findByRole("option", { name: /Kolkata/ })).toBeInTheDocument()
  })

  it("is keyboard operable: type, arrow, Enter", async () => {
    search("chicago")
    await screen.findByRole("option", { name: /Chicago/ })
    fireEvent.keyDown(input(), { key: "Enter" })
    expect(await screen.findByText("America/Chicago", { selector: "output" })).toBeInTheDocument()
    expect(input()).toHaveValue("Central Time — Chicago")
  })

  it("says so when nothing matches", async () => {
    search("atlantis")
    expect(await screen.findByText("No matches.")).toBeInTheDocument()
    expect(screen.queryAllByRole("option")).toHaveLength(0)
  })

  it("can be cleared when optional", () => {
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }))
    expect(screen.getByText("none")).toBeInTheDocument()
  })
})
