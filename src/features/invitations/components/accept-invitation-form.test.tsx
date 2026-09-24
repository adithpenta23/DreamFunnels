import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { toast } from "@/components/ui/toast"
import { acceptInvitationAction } from "../actions"
import { AcceptInvitationForm } from "./accept-invitation-form"

const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))
vi.mock("../actions", () => ({ acceptInvitationAction: vi.fn() }))
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const acceptMock = vi.mocked(acceptInvitationAction)
const token = "T".repeat(43)

describe("AcceptInvitationForm", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("accepts and opens the workspace", async () => {
    acceptMock.mockResolvedValue({
      ok: true,
      data: { workspaceSlug: "abc-roofing", alreadyMember: false },
    })
    render(<AcceptInvitationForm token={token} workspaceName="ABC Roofing" askForName={false} />)
    expect(screen.queryByLabelText("Your name")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Accept invitation" }))

    await waitFor(() => expect(push).toHaveBeenCalledWith("/w/abc-roofing"))
    expect(toast.success).toHaveBeenCalledWith("Welcome to ABC Roofing")
    // The token is the only reference sent: no workspace id to trust.
    const formData = acceptMock.mock.calls[0]?.[1]
    expect([...(formData?.keys() ?? [])]).toEqual(["token"])
    expect(formData?.get("token")).toBe(token)
  })

  it("asks a new account for its name", async () => {
    acceptMock.mockResolvedValue({
      ok: true,
      data: { workspaceSlug: "abc-roofing", alreadyMember: false },
    })
    render(<AcceptInvitationForm token={token} workspaceName="ABC Roofing" askForName />)
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Alex Smith" } })
    fireEvent.click(screen.getByRole("button", { name: "Accept invitation" }))

    await waitFor(() => expect(acceptMock).toHaveBeenCalled())
    expect(acceptMock.mock.calls[0]?.[1].get("fullName")).toBe("Alex Smith")
  })

  it("explains a refusal and stays put", async () => {
    acceptMock.mockResolvedValue({
      ok: false,
      error: {
        code: "FORBIDDEN",
        message:
          "This invitation was sent to a different email address. Sign in with that address to accept it.",
      },
    })
    render(<AcceptInvitationForm token={token} workspaceName="ABC Roofing" askForName={false} />)
    fireEvent.click(screen.getByRole("button", { name: "Accept invitation" }))

    expect(await screen.findByRole("alert")).toHaveTextContent(/different email address/)
    expect(push).not.toHaveBeenCalled()
  })
})
