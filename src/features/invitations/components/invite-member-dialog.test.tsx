import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { toast } from "@/components/ui/toast"
import { acmeWorkspace } from "@/test/fixtures"
import { inviteMemberAction, resendInvitationAction, revokeInvitationAction } from "../actions"
import { InviteMemberDialog } from "./invite-member-dialog"

vi.mock("../actions", () => ({
  inviteMemberAction: vi.fn(),
  resendInvitationAction: vi.fn(),
  revokeInvitationAction: vi.fn(),
}))
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const inviteMock = vi.mocked(inviteMemberAction)
const invitationId = "11111111-2222-4333-8444-555555555555"

async function openDialog(workspaceType: "agency" | "client" = "agency") {
  render(
    <InviteMemberDialog
      workspaceId={acmeWorkspace.id}
      workspaceName={acmeWorkspace.name}
      workspaceType={workspaceType}
    />
  )
  fireEvent.click(screen.getByRole("button", { name: "Invite member" }))
  return screen.findByRole("dialog", { name: "Invite someone to Acme Rockets" })
}

function fillAndSend(dialog: HTMLElement, email = "alex@example.com") {
  fireEvent.change(within(dialog).getByLabelText("Email"), { target: { value: email } })
  fireEvent.click(within(dialog).getByRole("radio", { name: /^Admin/ }))
  fireEvent.click(within(dialog).getByRole("button", { name: "Send invitation" }))
}

describe("InviteMemberDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("sends the invitation with the chosen role, confirms, and closes", async () => {
    inviteMock.mockResolvedValue({
      ok: true,
      data: { status: "invited", invitationId, email: "alex@example.com", delivery: "sent" },
    })
    const dialog = await openDialog()
    fillAndSend(dialog)

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Invitation sent", {
        description: "We emailed alex@example.com a link to join Acme Rockets.",
      })
    )
    const formData = inviteMock.mock.calls[0]?.[1]
    expect(formData?.get("workspaceId")).toBe(acmeWorkspace.id)
    expect(formData?.get("email")).toBe("alex@example.com")
    expect(formData?.get("role")).toBe("admin")
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })

  it("never claims 'sent' when the email didn't go out", async () => {
    inviteMock.mockResolvedValue({
      ok: true,
      data: { status: "invited", invitationId, email: "alex@example.com", delivery: "not_sent" },
    })
    fillAndSend(await openDialog())

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Invitation created, but the email wasn't sent",
        expect.anything()
      )
    )
    expect(toast.success).not.toHaveBeenCalled()
  })

  it("shows why an address can't be invited, next to the field, keeping it", async () => {
    inviteMock.mockResolvedValue({
      ok: false,
      error: {
        code: "CONFLICT",
        message: "That conflicts with existing data.",
        fieldErrors: { email: ["Alex Smith is already a member of this workspace."] },
      },
    })
    const dialog = await openDialog()
    fillAndSend(dialog)

    expect(
      await within(dialog).findByText("Alex Smith is already a member of this workspace.")
    ).toBeInTheDocument()
    const email = within(dialog).getByLabelText("Email")
    expect(email).toHaveValue("alex@example.com")
    expect(email).toHaveAttribute("aria-invalid", "true")
  })

  it("offers to resend or cancel when the person already has a pending invitation", async () => {
    inviteMock.mockResolvedValue({
      ok: true,
      data: { status: "already_pending", invitationId, email: "alex@example.com" },
    })
    vi.mocked(resendInvitationAction).mockResolvedValue({
      ok: true,
      data: { email: "alex@example.com", delivery: "sent" },
    })
    const dialog = await openDialog()
    fillAndSend(dialog)

    expect(
      await within(dialog).findByText("This person already has a pending invitation.")
    ).toBeInTheDocument()
    expect(within(dialog).getByRole("button", { name: "Cancel invitation" })).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole("button", { name: "Resend invitation" }))

    await waitFor(() =>
      expect(resendInvitationAction).toHaveBeenCalledWith({
        workspaceId: acmeWorkspace.id,
        invitationId,
      })
    )
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Invitation sent again", expect.anything())
    )
    expect(revokeInvitationAction).not.toHaveBeenCalled()
  })

  it("explains what each role can do, including agency admins' reach into clients", async () => {
    const dialog = await openDialog("agency")
    expect(within(dialog).getByRole("radio", { name: /^Admin/ })).toHaveAccessibleDescription(
      /every client workspace/
    )
    expect(within(dialog).getByRole("radio", { name: /^Member/ })).toBeChecked()
    expect(within(dialog).queryByRole("radio", { name: /^Owner/ })).not.toBeInTheDocument()
  })
})
