import { fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { toast } from "@/components/ui/toast"
import { acmeWorkspace } from "@/test/fixtures"
import { updateWorkspaceProfileAction } from "../actions"
import type { WorkspaceProfile } from "../types"
import { WorkspaceProfileForm } from "./workspace-profile-form"

vi.mock("../actions", () => ({ updateWorkspaceProfileAction: vi.fn() }))
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const updateMock = vi.mocked(updateWorkspaceProfileAction)

const emptyProfile: WorkspaceProfile = {
  timezone: "UTC",
  businessName: null,
  businessEmail: null,
  businessPhone: null,
  websiteUrl: null,
  addressLine1: null,
  addressLine2: null,
  addressCity: null,
  addressRegion: null,
  addressPostalCode: null,
  addressCountry: null,
  logoUrl: null,
  brandPrimaryColor: null,
  brandSecondaryColor: null,
}

const timezoneOptions = [
  { value: "UTC", label: "Coordinated Universal Time (UTC)", description: "UTC · GMT+0" },
  {
    value: "America/Chicago",
    label: "Central Time — Chicago",
    description: "America/Chicago · GMT-6",
  },
]
const countryOptions = [
  { value: "CA", label: "Canada" },
  { value: "US", label: "United States" },
]

function renderForm(props: Partial<Parameters<typeof WorkspaceProfileForm>[0]> = {}) {
  return render(
    <WorkspaceProfileForm
      workspaceId={acmeWorkspace.id}
      workspaceName={acmeWorkspace.name}
      profile={emptyProfile}
      canManage
      timezoneOptions={timezoneOptions}
      countryOptions={countryOptions}
      {...props}
    />
  )
}

const save = () => screen.getByRole("button", { name: "Save business profile" })

describe("WorkspaceProfileForm", () => {
  beforeEach(() => {
    updateMock.mockReset()
    vi.mocked(toast.success).mockReset()
  })

  it("is read-only for members", () => {
    renderForm({ canManage: false })
    expect(screen.getByText(/Only workspace owners and admins/)).toBeInTheDocument()
    expect(screen.getByLabelText("Business name")).toBeDisabled()
    expect(screen.getByLabelText("Time zone")).toBeDisabled()
    expect(screen.getByLabelText("Primary color")).toBeDisabled()
    expect(screen.queryByRole("button", { name: "Save business profile" })).not.toBeInTheDocument()
  })

  it("shows the current values, with the time zone's readable name", () => {
    renderForm({
      profile: { ...emptyProfile, timezone: "America/Chicago", businessPhone: "+15125550100" },
    })
    expect(screen.getByLabelText("Time zone")).toHaveValue("Central Time — Chicago")
    expect(screen.getByLabelText("Phone")).toHaveValue("+15125550100")
    expect(screen.getByLabelText("Business name")).toHaveAttribute("placeholder", "Acme Rockets")
  })

  it("enables saving only after a change, and Cancel restores the saved values", () => {
    renderForm()
    expect(save()).toBeDisabled()

    fireEvent.change(screen.getByLabelText("City"), { target: { value: "Austin" } })
    expect(save()).toBeEnabled()

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(screen.getByLabelText("City")).toHaveValue("")
    expect(save()).toBeDisabled()
  })

  it("submits every field, then shows the values as stored", async () => {
    updateMock.mockResolvedValue({
      ok: true,
      data: {
        ...emptyProfile,
        businessPhone: "+15125550100",
        brandPrimaryColor: "#1d4ed8",
        addressCity: "Austin",
      },
    })
    renderForm()

    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "+1 (512) 555-0100" } })
    fireEvent.change(screen.getByLabelText("City"), { target: { value: "Austin" } })
    fireEvent.change(screen.getByLabelText("Primary color"), { target: { value: "#1D4ED8" } })
    fireEvent.click(save())

    await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith("Business profile saved"))
    const formData = updateMock.mock.calls[0]?.[1]
    expect(formData?.get("workspaceId")).toBe(acmeWorkspace.id)
    expect(formData?.get("businessPhone")).toBe("+1 (512) 555-0100")
    expect(formData?.get("timezone")).toBe("UTC")
    expect(formData?.get("addressCity")).toBe("Austin")

    // The toast fires inside the action, before React commits the result:
    // wait for the idle button (not "Saving…") before checking the form.
    expect(await screen.findByRole("button", { name: "Save business profile" })).toBeDisabled()
    // The normalised values replace what was typed, and the form is clean again.
    expect(screen.getByLabelText("Phone")).toHaveValue("+15125550100")
    expect(screen.getByLabelText("Primary color")).toHaveValue("#1d4ed8")
  })

  it("shows field errors next to their fields and keeps what was typed", async () => {
    updateMock.mockResolvedValue({
      ok: false,
      error: {
        code: "VALIDATION",
        message: "Please check the highlighted fields and try again.",
        fieldErrors: { businessPhone: ["Enter a valid phone number."] },
      },
    })
    renderForm()

    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "555-0100" } })
    fireEvent.click(save())

    expect(await screen.findByText("Enter a valid phone number.")).toBeInTheDocument()
    expect(screen.getByLabelText("Phone")).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByLabelText("Phone")).toHaveValue("555-0100")
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it("shows a server error for the form as a whole", async () => {
    updateMock.mockResolvedValue({
      ok: false,
      error: { code: "INTERNAL", message: "Something went wrong on our side. Please try again." },
    })
    renderForm()

    fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "Acme LLC" } })
    fireEvent.click(save())

    expect(await screen.findByRole("alert")).toHaveTextContent(/Something went wrong/)
    expect(screen.getByLabelText("Business name")).toHaveValue("Acme LLC")
  })

  it("previews an https logo", () => {
    renderForm()
    fireEvent.change(screen.getByLabelText("Logo URL"), {
      target: { value: "https://cdn.example.com/logo.png" },
    })
    const preview = screen.getByRole("img", { name: "Logo preview" })
    expect(preview).toHaveAttribute("src", "https://cdn.example.com/logo.png")
  })

  it("lets a color be cleared", () => {
    renderForm({ profile: { ...emptyProfile, brandSecondaryColor: "#f59e0b" } })
    const group = screen.getByLabelText("Secondary color").parentElement as HTMLElement
    fireEvent.click(within(group).getByRole("button", { name: "Clear secondary color" }))
    expect(screen.getByLabelText("Secondary color")).toHaveValue("")
  })
})
