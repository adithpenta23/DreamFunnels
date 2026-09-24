import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { toast } from "@/components/ui/toast"
import { acmeWorkspace } from "@/test/fixtures"
import { changeMemberRoleAction, removeMemberAction } from "../actions"
import type { WorkspaceRole } from "../lib/roles"
import { MembersList, type MemberRow } from "./members-list"

vi.mock("../actions", () => ({ changeMemberRoleAction: vi.fn(), removeMemberAction: vi.fn() }))
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const owner: MemberRow = {
  userId: "00000000-0000-4000-8000-000000000001",
  fullName: "Olivia Owner",
  email: "olivia@example.com",
  role: "owner",
  joinedAt: "2026-09-01T00:00:00Z",
  joinedLabel: "Sep 1, 2026",
}
const admin: MemberRow = {
  ...owner,
  userId: "00000000-0000-4000-8000-000000000002",
  fullName: "Adam Admin",
  email: "adam@example.com",
  role: "admin",
}
const sarah: MemberRow = {
  ...owner,
  userId: "00000000-0000-4000-8000-000000000003",
  fullName: "Sarah Lee",
  email: "sarah@example.com",
  role: "member",
}

function renderAs(viewer: MemberRow, role: WorkspaceRole = viewer.role) {
  return render(
    <MembersList
      workspaceId={acmeWorkspace.id}
      workspaceName={acmeWorkspace.name}
      workspaceType="agency"
      viewer={{ userId: viewer.userId, role }}
      members={[owner, admin, sarah]}
    />
  )
}

const actionsFor = (name: string) => screen.queryByRole("button", { name: `Actions for ${name}` })

async function openActions(name: string) {
  fireEvent.click(screen.getByRole("button", { name: `Actions for ${name}` }))
  return screen.findByRole("menu")
}

describe("MembersList", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("lists members with their roles, and marks you", () => {
    renderAs(admin)
    const rows = screen.getAllByRole("row").slice(1)
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Olivia Owner"),
      expect.stringContaining("Adam AdminYou"),
      expect.stringContaining("Sarah Lee"),
    ])
    expect(within(rows[2]!).getByText("sarah@example.com")).toBeInTheDocument()
    expect(within(rows[2]!).getByText("Member")).toBeInTheDocument()
  })

  it("gives owners actions on everyone but themselves", () => {
    renderAs(owner)
    expect(actionsFor("Olivia Owner")).not.toBeInTheDocument()
    expect(actionsFor("Adam Admin")).toBeInTheDocument()
    expect(actionsFor("Sarah Lee")).toBeInTheDocument()
  })

  it("never lets an admin act on an owner", () => {
    renderAs(admin)
    expect(actionsFor("Olivia Owner")).not.toBeInTheDocument()
    expect(actionsFor("Sarah Lee")).toBeInTheDocument()
  })

  it("is read-only for plain members", () => {
    renderAs(sarah)
    expect(screen.queryAllByRole("button", { name: /^Actions for/ })).toHaveLength(0)
  })

  it("asks before removing someone, then removes them", async () => {
    vi.mocked(removeMemberAction).mockResolvedValue({ ok: true, data: null })
    renderAs(owner)
    const menu = await openActions("Sarah Lee")
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Remove from workspace…" }))

    const dialog = await screen.findByRole("alertdialog", {
      name: "Remove Sarah Lee from Acme Rockets?",
    })
    expect(dialog).toHaveTextContent(/removes their access to this workspace/)
    expect(dialog).toHaveTextContent(
      /account and any other workspaces they belong to aren't affected/
    )
    expect(removeMemberAction).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole("button", { name: "Remove member" }))
    await waitFor(() =>
      expect(removeMemberAction).toHaveBeenCalledWith({
        workspaceId: acmeWorkspace.id,
        userId: sarah.userId,
      })
    )
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Sarah Lee was removed", expect.anything())
    )
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
  })

  it("keeps the dialog open with the reason when removal is refused", async () => {
    vi.mocked(removeMemberAction).mockResolvedValue({
      ok: false,
      error: {
        code: "CONFLICT",
        message: "A workspace needs at least one owner, so its last owner can't be removed.",
      },
    })
    renderAs(owner)
    fireEvent.click(
      within(await openActions("Adam Admin")).getByRole("menuitem", {
        name: "Remove from workspace…",
      })
    )
    const dialog = await screen.findByRole("alertdialog")
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove member" }))

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/needs at least one owner/)
    expect(toast.success).not.toHaveBeenCalled()
  })

  it("changes a role to member or admin only", async () => {
    vi.mocked(changeMemberRoleAction).mockResolvedValue({ ok: true, data: { role: "admin" } })
    renderAs(owner)
    fireEvent.click(
      within(await openActions("Sarah Lee")).getByRole("menuitem", { name: "Change role…" })
    )
    const dialog = await screen.findByRole("dialog", { name: "Change Sarah Lee's role" })
    expect(within(dialog).queryByRole("radio", { name: /^Owner/ })).not.toBeInTheDocument()
    const save = within(dialog).getByRole("button", { name: "Save role" })
    expect(save).toBeDisabled()

    fireEvent.click(within(dialog).getByRole("radio", { name: /^Admin/ }))
    fireEvent.click(save)

    await waitFor(() =>
      expect(changeMemberRoleAction).toHaveBeenCalledWith({
        workspaceId: acmeWorkspace.id,
        userId: sarah.userId,
        role: "admin",
      })
    )
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Sarah Lee is now an admin"))
  })

  it("warns an owner that changing a co-owner's role removes their ownership", async () => {
    const coOwner = { ...admin, role: "owner" as const, fullName: "Cora Owner" }
    render(
      <MembersList
        workspaceId={acmeWorkspace.id}
        workspaceName={acmeWorkspace.name}
        workspaceType="agency"
        viewer={{ userId: owner.userId, role: "owner" }}
        members={[owner, coOwner]}
      />
    )
    fireEvent.click(
      within(await openActions("Cora Owner")).getByRole("menuitem", { name: "Change role…" })
    )
    const dialog = await screen.findByRole("dialog")
    expect(dialog).toHaveTextContent(/removes their ownership/)
  })
})
