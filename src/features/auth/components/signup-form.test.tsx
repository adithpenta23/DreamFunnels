import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { resendConfirmation, signUp } from "../actions"
import { SignupForm } from "./signup-form"

vi.mock("../actions", () => ({ signUp: vi.fn(), resendConfirmation: vi.fn() }))

const signUpMock = vi.mocked(signUp)
const resendMock = vi.mocked(resendConfirmation)

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText("Work email"), { target: { value: "ada@example.com" } })
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "correct horse" } })
  fireEvent.click(screen.getByRole("button", { name: "Create account" }))
}

describe("SignupForm", () => {
  beforeEach(() => {
    signUpMock.mockReset()
    resendMock.mockReset()
  })

  it("explains the password rule up front", () => {
    render(<SignupForm />)
    expect(screen.getByLabelText("Password")).toHaveAccessibleDescription(/At least 8 characters/)
  })

  it("shows the server's password feedback on the password field", async () => {
    signUpMock.mockResolvedValue({
      ok: false,
      error: {
        code: "VALIDATION",
        message: "Please check the highlighted fields and try again.",
        fieldErrors: { password: ["Use at least 8 characters."] },
      },
    })
    render(<SignupForm />)

    fillAndSubmit()
    expect(await screen.findByText("Use at least 8 characters.")).toBeInTheDocument()
    expect(screen.getByLabelText("Password")).toHaveAttribute("aria-invalid", "true")
  })

  it("asks the user to confirm their email when the project requires it, and can resend", async () => {
    signUpMock.mockResolvedValue({ ok: true, data: { email: "ada@example.com" } })
    resendMock.mockResolvedValue({ ok: true, data: null })
    render(<SignupForm />)

    fillAndSubmit()
    expect(await screen.findByText("Check your email")).toBeInTheDocument()
    expect(screen.getByText("ada@example.com")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Resend email" }))
    await vi.waitFor(() => expect(resendMock).toHaveBeenCalledWith("ada@example.com"))
  })
})
