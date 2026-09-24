import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { toast } from "@/components/ui/toast"
import { acmeWorkspace } from "@/test/fixtures"
import { resendInvitationAction, revokeInvitationAction } from "../actions"
import { PendingInvitations, type PendingInvitationRow } from "./pending-invitations"

vi.mock("../actions", () => ({ resendInvitationAction: vi.fn(), revokeInvitationAction: vi.fn() }))
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const pending: PendingInvitationRow = {
  id: "11111111-2222-4333-8444-555555555555",
  email: "alex@example.com",
  role: "admin",
  status: "pending",
  detail: "Expires in 6 days",
  sentLabel: "Sent Sep 23, 2026",
}
const undelivered: PendingInvitationRow = {
  ...pending,
  id: "11111111-2222-4333-8444-666666666666",
  email: "bea@example.com",
  status: "not_delivered",
}
const expired: PendingInvitationRow = {
  ...pending,
  id: "11111111-2222-4333-8444-777777777777",
  email: "cy@example.com",
  status: "expired",
  detail: "Expired 2 days ago",
}

async function openActions(email: string) {
  render(
    <PendingInvitations
      workspaceId={acmeWorkspace.id}
      invitations={[pending, undelivered, expired]}
    />
  )
  fireEvent.click(screen.getByRole("button", { name: `Actions for the invitation to ${email}` }))
  return screen.findByRole("menu")
}

describe("PendingInvitations", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("shows each invitation's state in words, not colour alone", () => {
    render(
      <PendingInvitations
        workspaceId={acmeWorkspace.id}
        invitations={[pending, undelivered, expired]}
      />
    )
    const rows = screen.getAllByRole("row").slice(1)
    expect(rows[0]).toHaveTextContent(/alex@example.com.*Pending.*Expires in 6 days/)
    expect(rows[1]).toHaveTextContent(/Email not delivered/)
    expect(rows[2]).toHaveTextContent(/Expired.*Expired 2 days ago/)
  })

  it("resends with a new link and says so", async () => {
    vi.mocked(resendInvitationAction).mockResolvedValue({
      ok: true,
      data: { email: "alex@example.com", delivery: "sent" },
    })
    const menu = await openActions("alex@example.com")
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Resend invitation" }))

    await waitFor(() =>
      expect(resendInvitationAction).toHaveBeenCalledWith({
        workspaceId: acmeWorkspace.id,
        invitationId: pending.id,
      })
    )
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Invitation sent again", {
        description: expect.stringMatching(/previous link no longer works/),
      })
    )
  })

  it("offers a fresh invitation for an expired one", async () => {
    const menu = await openActions("cy@example.com")
    expect(
      within(menu).getByRole("menuitem", { name: "Send a new invitation" })
    ).toBeInTheDocument()
  })

  it("asks before revoking, explaining the link stops working", async () => {
    vi.mocked(revokeInvitationAction).mockResolvedValue({ ok: true, data: null })
    const menu = await openActions("alex@example.com")
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Revoke invitation…" }))

    const dialog = await screen.findByRole("alertdialog", {
      name: "Revoke the invitation to alex@example.com?",
    })
    expect(dialog).toHaveTextContent("This link will stop working.")
    expect(revokeInvitationAction).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole("button", { name: "Revoke invitation" }))
    await waitFor(() =>
      expect(revokeInvitationAction).toHaveBeenCalledWith({
        workspaceId: acmeWorkspace.id,
        invitationId: pending.id,
      })
    )
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Invitation revoked", expect.anything())
    )
  })

  it("does nothing when revoking is cancelled", async () => {
    const menu = await openActions("alex@example.com")
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Revoke invitation…" }))
    const dialog = await screen.findByRole("alertdialog")
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
    expect(revokeInvitationAction).not.toHaveBeenCalled()
  })
})
