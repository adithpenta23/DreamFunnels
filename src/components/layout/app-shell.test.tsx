import { fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AppContextProvider } from "@/components/providers/app-context"
import { useUIStore } from "@/stores/ui-store"
import { appContext } from "@/test/fixtures"
import { AppShell } from "./app-shell"

vi.mock("next/navigation", () => ({ usePathname: () => "/w/acme" }))
// Server Actions can't run in jsdom; the shell only needs a callable.
vi.mock("@/features/auth/actions", () => ({ signOut: vi.fn() }))

function renderShell() {
  return render(
    <AppContextProvider value={appContext}>
      <AppShell>
        <h1>Page content</h1>
      </AppShell>
    </AppContextProvider>
  )
}

describe("AppShell", () => {
  beforeEach(() => {
    useUIStore.setState({ mobileNavOpen: false })
  })

  it("renders the page inside the shell with the workspace navigation", () => {
    renderShell()

    expect(screen.getByRole("main")).toHaveTextContent("Page content")
    const nav = screen.getByRole("navigation", { name: "Main" })
    expect(within(nav).getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "aria-current",
      "page"
    )
    expect(within(nav).getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/w/acme")
    expect(within(nav).getByRole("link", { name: "Settings" })).toHaveAttribute(
      "href",
      "/w/acme/settings"
    )
  })

  it("shows planned modules as disabled 'Soon' entries, not links", () => {
    renderShell()
    const nav = screen.getByRole("navigation", { name: "Main" })

    for (const label of [
      "Funnels",
      "Websites",
      "Leads",
      "Emails",
      "Automations",
      "Analytics",
      "Payments",
    ]) {
      expect(within(nav).queryByRole("link", { name: new RegExp(label) })).not.toBeInTheDocument()
      const entry = within(nav).getByText(label).closest("[aria-disabled]")
      expect(entry).toHaveAttribute("aria-disabled", "true")
      expect(entry).toHaveTextContent("Soon")
    }
  })

  it("shows the current workspace and the user's initials", () => {
    renderShell()
    expect(
      screen.getByRole("button", { name: /Current workspace: Acme Rockets/ })
    ).toHaveTextContent("Owner")
    expect(screen.getByRole("button", { name: "Account menu" })).toHaveTextContent("AL")
  })

  it("opens the mobile navigation and closes it after a link is chosen", async () => {
    renderShell()

    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }))
    const sheet = await screen.findByRole("dialog")
    expect(useUIStore.getState().mobileNavOpen).toBe(true)

    const link = within(sheet).getByRole("link", { name: "Settings" })
    // jsdom can't navigate between documents; we only care about the nav state.
    link.addEventListener("click", (event) => event.preventDefault())
    fireEvent.click(link)
    expect(useUIStore.getState().mobileNavOpen).toBe(false)
  })
})
