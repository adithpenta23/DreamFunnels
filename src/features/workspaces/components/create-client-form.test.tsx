import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { acmeWorkspace } from "@/test/fixtures"
import { createClientWorkspaceAction } from "../actions"
import { CreateClientForm } from "./create-client-form"

vi.mock("../actions", () => ({ createClientWorkspaceAction: vi.fn() }))

const createMock = vi.mocked(createClientWorkspaceAction)

function renderForm() {
  render(
    <CreateClientForm
      agency={{ id: acmeWorkspace.id, name: acmeWorkspace.name, slug: acmeWorkspace.slug }}
      defaultTimezone="America/Chicago"
      timezoneOptions={[
        { value: "UTC", label: "Coordinated Universal Time (UTC)" },
        { value: "America/Chicago", label: "Central Time — Chicago" },
      ]}
      countryOptions={[{ value: "US", label: "United States" }]}
    />
  )
}

const submit = () =>
  fireEvent.click(screen.getByRole("button", { name: "Create client workspace" }))

describe("CreateClientForm", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("says what will happen, including whether anyone is invited", () => {
    renderForm()
    expect(screen.getByText(/Nobody else is invited yet/)).toBeInTheDocument()
    expect(screen.queryByRole("radio")).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "ABC Roofing" } })
    fireEvent.change(screen.getByLabelText("Their email"), {
      target: { value: "owner@abc.example" },
    })

    expect(
      screen.getByText(/A new, empty workspace for ABC Roofing is created/)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/We'll email an invitation to owner@abc.example to join as an admin/)
    ).toBeInTheDocument()
    // The role only matters once someone is being invited; admin by default.
    expect(screen.getByRole("radio", { name: /^Admin/ })).toBeChecked()
    expect(screen.queryByRole("radio", { name: /^Owner/ })).not.toBeInTheDocument()
  })

  it("previews the URL generated from the business name", () => {
    renderForm()
    fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "Café Roofing" } })
    expect(screen.getByText(/Leave blank to use “cafe-roofing”/)).toBeInTheDocument()
  })

  it("submits the business and invitation, then shows the new client", async () => {
    createMock.mockResolvedValue({
      ok: true,
      data: {
        client: { name: "ABC Roofing", slug: "abc-roofing" },
        invitation: { email: "owner@abc.example", outcome: "sent" },
      },
    })
    renderForm()
    fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "ABC Roofing" } })
    fireEvent.change(screen.getByLabelText("Their email"), {
      target: { value: "owner@abc.example" },
    })
    submit()

    expect(await screen.findByText("Client workspace created")).toBeInTheDocument()
    const formData = createMock.mock.calls[0]?.[1]
    expect(formData?.get("agencyId")).toBe(acmeWorkspace.id)
    expect(formData?.get("businessName")).toBe("ABC Roofing")
    expect(formData?.get("timezone")).toBe("America/Chicago")
    expect(formData?.get("ownerRole")).toBe("admin")

    expect(screen.getByText(/Invitation sent to/)).toHaveTextContent("owner@abc.example")
    expect(screen.getByRole("link", { name: "Open ABC Roofing" })).toHaveAttribute(
      "href",
      "/w/abc-roofing"
    )
    expect(screen.getByRole("link", { name: "Back to clients" })).toHaveAttribute(
      "href",
      "/w/acme/clients"
    )
  })

  it("is honest when the client exists but the invitation email failed", async () => {
    createMock.mockResolvedValue({
      ok: true,
      data: {
        client: { name: "ABC Roofing", slug: "abc-roofing" },
        invitation: { email: "owner@abc.example", outcome: "not_sent" },
      },
    })
    renderForm()
    fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "ABC Roofing" } })
    submit()

    expect(await screen.findByText("Client workspace created")).toBeInTheDocument()
    expect(screen.getByRole("alert")).toHaveTextContent(
      /invitation email to owner@abc.example couldn't be sent/
    )
    expect(screen.queryByText(/Invitation sent to/)).not.toBeInTheDocument()
  })

  it("shows errors on their fields and keeps what was typed", async () => {
    createMock.mockResolvedValue({
      ok: false,
      error: {
        code: "CONFLICT",
        message: "That conflicts with existing data.",
        fieldErrors: {
          workspaceName: [
            "You already have a client with this name. Use a different workspace name.",
          ],
        },
      },
    })
    renderForm()
    fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "ABC Roofing" } })
    submit()

    expect(await screen.findByText(/already have a client with this name/)).toBeInTheDocument()
    expect(screen.getByLabelText("Business name")).toHaveValue("ABC Roofing")
  })

  it("starts over for another client", async () => {
    createMock.mockResolvedValue({
      ok: true,
      data: { client: { name: "ABC Roofing", slug: "abc-roofing" }, invitation: null },
    })
    renderForm()
    fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "ABC Roofing" } })
    submit()
    fireEvent.click(await screen.findByRole("button", { name: "Add another client" }))

    await waitFor(() => expect(screen.getByLabelText("Business name")).toHaveValue(""))
  })
})
