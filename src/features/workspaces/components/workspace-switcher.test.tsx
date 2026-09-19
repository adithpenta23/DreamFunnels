import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { AppContextProvider } from "@/components/providers/app-context"
import { appContext } from "@/test/fixtures"
import { WorkspaceSwitcher } from "./workspace-switcher"

describe("WorkspaceSwitcher", () => {
  it("lists the user's workspaces as links and marks the current one", async () => {
    render(
      <AppContextProvider value={appContext}>
        <WorkspaceSwitcher />
      </AppContextProvider>
    )

    fireEvent.click(screen.getByRole("button", { name: /Switch workspace/ }))
    const menu = await screen.findByRole("menu")

    const current = within(menu).getByRole("menuitem", { name: /Acme Rockets/ })
    expect(current).toHaveAttribute("href", "/w/acme")
    expect(current).toHaveAttribute("aria-current", "page")

    const other = within(menu).getByRole("menuitem", { name: /Beta Labs/ })
    expect(other).toHaveAttribute("href", "/w/beta-labs")
    expect(other).not.toHaveAttribute("aria-current")

    expect(within(menu).getByRole("menuitem", { name: "Create workspace" })).toHaveAttribute(
      "href",
      "/workspaces/new"
    )
    expect(within(menu).getByRole("menuitem", { name: "Workspace settings" })).toHaveAttribute(
      "href",
      "/w/acme/settings"
    )
  })
})
