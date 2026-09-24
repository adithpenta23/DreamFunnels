import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { toast } from "@/components/ui/toast"
import { acceptPendingInvitationAction } from "../actions"
import { PendingInvitationList, type PendingInvitationRow } from "./pending-invitation-list"

const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))
vi.mock("../actions", () => ({ acceptPendingInvitationAction: vi.fn() }))
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const acceptMock = vi.mocked(acceptPendingInvitationAction)

const roofing: PendingInvitationRow = {
  id: "6f1c1d0e-1a2b-4c3d-8e9f-0a1b2c3d4e51",
  workspaceName: "ABC Roofing",
  role: "admin",
  inviterName: "Adith",
  expiresAt: "2026-10-01T00:00:00Z",
  expiresLabel: "Oct 1, 2026",
}
const plumbing: PendingInvitationRow = {
  ...roofing,
  id: "6f1c1d0e-1a2b-4c3d-8e9f-0a1b2c3d4e52",
  workspaceName: "Best Plumbing",
  role: "member",
  inviterName: null,
}

describe("PendingInvitationList", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("lists each invitation with workspace, role, inviter and expiry", () => {
    render(<PendingInvitationList invitations={[roofing, plumbing]} askForName={false} />)
    const items = within(screen.getByRole("list", { name: "Pending invitations" })).getAllByRole(
      "listitem"
    )
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining("ABC RoofingAdith invited you as an admin · Expires Oct 1, 2026"),
      expect.stringContaining("Best PlumbingYou're invited as a member · Expires Oct 1, 2026"),
    ])
    expect(screen.queryByLabelText("Your name")).not.toBeInTheDocument()
    // Nothing happens until someone presses Accept.
    expect(acceptMock).not.toHaveBeenCalled()
  })

  it("accepts one by id, hides it, and opens the workspace", async () => {
    acceptMock.mockResolvedValue({
      ok: true,
      data: { workspaceSlug: "abc-roofing", alreadyMember: false },
    })
    render(<PendingInvitationList invitations={[roofing, plumbing]} askForName={false} />)
    fireEvent.click(screen.getByRole("button", { name: "Accept invitation to ABC Roofing" }))

    await waitFor(() => expect(push).toHaveBeenCalledWith("/w/abc-roofing"))
    expect(acceptMock).toHaveBeenCalledWith({ invitationId: roofing.id })
    expect(toast.success).toHaveBeenCalledWith("Welcome to ABC Roofing")
    expect(screen.queryByText("ABC Roofing")).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Accept invitation to Best Plumbing" })
    ).toBeDisabled()
  })

  it("asks a nameless account for its name and shows the validation message", async () => {
    acceptMock.mockResolvedValueOnce({
      ok: false,
      error: {
        code: "VALIDATION",
        message: "Invalid input",
        fieldErrors: { fullName: ["Enter your name."] },
      },
    })
    render(<PendingInvitationList invitations={[roofing]} askForName />)
    const name = screen.getByLabelText("Your name for the team you join")
    fireEvent.click(screen.getByRole("button", { name: "Accept invitation to ABC Roofing" }))

    await waitFor(() => expect(name).toHaveAttribute("aria-invalid", "true"))
    expect(screen.getByText("Enter your name.")).toBeInTheDocument()
    expect(acceptMock).toHaveBeenCalledWith({ invitationId: roofing.id, fullName: "" })

    acceptMock.mockResolvedValueOnce({
      ok: true,
      data: { workspaceSlug: "abc-roofing", alreadyMember: false },
    })
    fireEvent.change(name, { target: { value: "Sarah Lee" } })
    fireEvent.click(screen.getByRole("button", { name: "Accept invitation to ABC Roofing" }))
    await waitFor(() =>
      expect(acceptMock).toHaveBeenLastCalledWith({
        invitationId: roofing.id,
        fullName: "Sarah Lee",
      })
    )
  })

  it("shows a refusal on its row and keeps the others usable", async () => {
    acceptMock.mockResolvedValue({
      ok: false,
      error: { code: "CONFLICT", message: "This invitation has expired. Ask for a new one." },
    })
    render(<PendingInvitationList invitations={[roofing, plumbing]} askForName={false} />)
    const accept = screen.getByRole("button", { name: "Accept invitation to ABC Roofing" })
    fireEvent.click(accept)

    expect(await screen.findByRole("alert")).toHaveTextContent(/expired/)
    expect(accept).toHaveAccessibleDescription(/expired/)
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Accept invitation to Best Plumbing" })
      ).toBeEnabled()
    )
    expect(push).not.toHaveBeenCalled()
  })
})
