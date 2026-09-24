import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { toast } from "@/components/ui/toast"
import { acmeWorkspace } from "@/test/fixtures"
import { leaveWorkspaceAction } from "../actions"
import { leavePolicy } from "../lib/members"
import { LeaveWorkspaceCard } from "./leave-workspace-card"

const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))
vi.mock("../actions", () => ({ leaveWorkspaceAction: vi.fn() }))
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const leaveMock = vi.mocked(leaveWorkspaceAction)

const policyFor = (overrides: Partial<Parameters<typeof leavePolicy>[0]> = {}) =>
  leavePolicy({
    workspaceName: "ABC Roofing",
    workspaceType: "agency",
    directRole: "member",
    directOwnerCount: 1,
    agency: null,
    ...overrides,
  })

function renderCard(policy = policyFor()) {
  return render(
    <LeaveWorkspaceCard
      workspaceId={acmeWorkspace.id}
      workspaceName="ABC Roofing"
      policy={policy}
    />
  )
}

describe("LeaveWorkspaceCard", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("confirms, leaves, and opens the next workspace", async () => {
    leaveMock.mockResolvedValue({ ok: true, data: { destination: "/w/other" as never } })
    renderCard()

    fireEvent.click(screen.getByRole("button", { name: "Leave workspace…" }))
    const dialog = await screen.findByRole("alertdialog", { name: "Leave ABC Roofing?" })
    expect(dialog).toHaveTextContent("You'll lose access to this workspace.")
    expect(leaveMock).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole("button", { name: "Leave workspace" }))
    await waitFor(() => expect(push).toHaveBeenCalledWith("/w/other"))
    expect(leaveMock).toHaveBeenCalledWith({ workspaceId: acmeWorkspace.id })
    expect(toast.success).toHaveBeenCalledWith("You left ABC Roofing")
  })

  it("keeps the dialog open with the server's reason", async () => {
    leaveMock.mockResolvedValue({
      ok: false,
      error: {
        code: "CONFLICT",
        message:
          "You're the only owner of this workspace. Transfer ownership to another member first, then you can leave.",
      },
    })
    renderCard(policyFor({ directRole: "owner", directOwnerCount: 2 }))
    fireEvent.click(screen.getByRole("button", { name: "Leave workspace…" }))
    const dialog = await screen.findByRole("alertdialog")
    expect(dialog).toHaveTextContent("The other owners keep managing it.")
    fireEvent.click(within(dialog).getByRole("button", { name: "Leave workspace" }))

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/only owner/)
    expect(push).not.toHaveBeenCalled()
  })

  it("disables leaving for an agency's last owner and says why", () => {
    renderCard(policyFor({ directRole: "owner", directOwnerCount: 1 }))
    const button = screen.getByRole("button", { name: "Leave workspace…" })
    expect(button).toBeDisabled()
    expect(button).toHaveAccessibleDescription(/only owner of ABC Roofing. Transfer ownership/)
  })

  it("explains access that only comes through the agency", () => {
    renderCard(
      policyFor({
        workspaceType: "client",
        directRole: null,
        agency: { name: "Acme Agency", role: "owner" },
      })
    )
    expect(screen.getByRole("button", { name: "Leave workspace…" })).toBeDisabled()
    expect(screen.getByText(/through Acme Agency/)).toBeInTheDocument()
  })

  it("lets a client's last direct owner leave, naming who keeps ownership", async () => {
    renderCard(
      policyFor({
        workspaceType: "client",
        directRole: "owner",
        directOwnerCount: 1,
        agency: { name: "Acme Agency", role: "member" },
      })
    )
    fireEvent.click(screen.getByRole("button", { name: "Leave workspace…" }))
    expect(await screen.findByRole("alertdialog")).toHaveTextContent(
      /owners of Acme Agency will keep ownership/
    )
  })
})
