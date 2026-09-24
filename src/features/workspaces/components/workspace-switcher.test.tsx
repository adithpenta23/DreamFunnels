import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { AppContextProvider } from "@/components/providers/app-context"
import { acmeWorkspace, appContext, betaWorkspace } from "@/test/fixtures"
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

describe("WorkspaceSwitcher with clients", () => {
  const client = (name: string, slug: string) => ({
    ...betaWorkspace,
    id: `c-${slug}`,
    name,
    slug,
    role: "owner" as const,
    type: "client" as const,
    parentId: acmeWorkspace.id,
  })
  const abc = client("ABC Roofing", "abc-roofing")
  const sunrise = client("Sunrise Dental", "sunrise-dental")

  it("groups agencies and clients, and links to all of an agency's clients", async () => {
    render(
      <AppContextProvider
        value={{ ...appContext, workspaces: [acmeWorkspace, abc, sunrise], moreClients: true }}
      >
        <WorkspaceSwitcher />
      </AppContextProvider>
    )
    fireEvent.click(screen.getByRole("button", { name: /Switch workspace/ }))
    const menu = await screen.findByRole("menu")

    const [workspaces, clients] = within(menu).getAllByRole("group")
    expect(within(workspaces!).getByRole("menuitem", { name: /Acme Rockets/ })).toBeInTheDocument()
    expect(
      within(clients!)
        .getAllByRole("menuitem")
        .map((item) => item.textContent)
    ).toEqual(["AABC Roofing", "SSunrise Dental", "View all clients"])
    expect(within(menu).getByRole("menuitem", { name: "View all clients" })).toHaveAttribute(
      "href",
      "/w/acme/clients"
    )
  })

  it("shows which agency a client belongs to, and lists it even beyond the cap", async () => {
    render(
      <AppContextProvider
        value={{
          ...appContext,
          workspace: abc,
          workspaces: [acmeWorkspace, sunrise],
          moreClients: true,
          parentWorkspace: { name: "Acme Rockets", slug: "acme" },
        }}
      >
        <WorkspaceSwitcher />
      </AppContextProvider>
    )
    const trigger = screen.getByRole("button", { name: /Current workspace: ABC Roofing/ })
    expect(trigger).toHaveTextContent("Client of Acme Rockets")

    fireEvent.click(trigger)
    const menu = await screen.findByRole("menu")
    expect(within(menu).getByRole("menuitem", { name: /ABC Roofing/ })).toHaveAttribute(
      "aria-current",
      "page"
    )
  })
})
