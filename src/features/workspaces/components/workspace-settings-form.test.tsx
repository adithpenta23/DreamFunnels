import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { acmeWorkspace } from "@/test/fixtures"
import { updateWorkspaceAction } from "../actions"
import { WorkspaceSettingsForm } from "./workspace-settings-form"

const replace = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }))
vi.mock("../actions", () => ({ updateWorkspaceAction: vi.fn() }))

const updateMock = vi.mocked(updateWorkspaceAction)

describe("WorkspaceSettingsForm", () => {
  beforeEach(() => {
    replace.mockReset()
    updateMock.mockReset()
  })

  it("is read-only for members, who can't change settings", () => {
    render(<WorkspaceSettingsForm workspace={acmeWorkspace} canManage={false} />)

    expect(screen.getByText(/Only workspace owners and admins/)).toBeInTheDocument()
    expect(screen.getByLabelText("Workspace name")).toBeDisabled()
    expect(screen.getByLabelText("Workspace URL")).toBeDisabled()
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument()
  })

  it("only enables saving once something changed, and warns before changing the URL", () => {
    render(<WorkspaceSettingsForm workspace={acmeWorkspace} canManage />)
    const save = screen.getByRole("button", { name: "Save changes" })
    expect(save).toBeDisabled()

    fireEvent.change(screen.getByLabelText("Workspace URL"), { target: { value: "acme-2" } })
    expect(save).toBeEnabled()
    expect(screen.getByText(/breaks existing links/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(screen.getByLabelText("Workspace URL")).toHaveValue("acme")
    expect(save).toBeDisabled()
  })

  it("moves to the new URL after the slug changes", async () => {
    updateMock.mockResolvedValue({ ok: true, data: { slug: "acme-2", slugChanged: true } })
    render(<WorkspaceSettingsForm workspace={acmeWorkspace} canManage />)

    fireEvent.change(screen.getByLabelText("Workspace URL"), { target: { value: "acme-2" } })
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }))

    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/w/acme-2/settings"))
    const formData = updateMock.mock.calls[0]?.[1]
    expect(formData?.get("workspaceId")).toBe(acmeWorkspace.id)
    expect(formData?.get("workspaceSlug")).toBe("acme-2")
  })

  it("shows a taken URL on the URL field", async () => {
    updateMock.mockResolvedValue({
      ok: false,
      error: {
        code: "CONFLICT",
        message: "That conflicts with existing data. Please refresh and try again.",
        fieldErrors: { workspaceSlug: ["That URL is already taken. Please try another."] },
      },
    })
    render(<WorkspaceSettingsForm workspace={acmeWorkspace} canManage />)

    fireEvent.change(screen.getByLabelText("Workspace URL"), { target: { value: "taken" } })
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }))

    expect(
      await screen.findByText("That URL is already taken. Please try another.")
    ).toBeInTheDocument()
    expect(screen.getByLabelText("Workspace URL")).toHaveAttribute("aria-invalid", "true")
    expect(replace).not.toHaveBeenCalled()
  })
})
