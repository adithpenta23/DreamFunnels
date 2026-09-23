import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { resendConfirmation, signUp } from "../actions"
import { SignupForm } from "./signup-form"

vi.mock("../actions", () => ({ signUp: vi.fn(), resendConfirmation: vi.fn() }))

// Stands in for Cloudflare: a button that "solves" the challenge by writing
// the token into the form, as the real widget does. No network.
const captcha = vi.hoisted(() => ({ siteKey: null as string | null }))
vi.mock("@/components/forms/turnstile-widget", () => ({
  captchaSiteKey: () => captcha.siteKey,
  TurnstileWidget: ({ onTokenChange }: { onTokenChange: (token: string | null) => void }) =>
    captcha.siteKey ? (
      <>
        <input type="hidden" name="cf-turnstile-response" value="solved-token" />
        <button type="button" onClick={() => onTokenChange("solved-token")}>
          Solve challenge
        </button>
      </>
    ) : null,
}))

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
    captcha.siteKey = null
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

  it("holds the button until the CAPTCHA is solved, then sends its token", async () => {
    captcha.siteKey = "site-key"
    signUpMock.mockResolvedValue({ ok: true, data: { email: "ada@example.com" } })
    render(<SignupForm />)

    const submit = screen.getByRole("button", { name: "Create account" })
    expect(submit).toBeDisabled()

    fireEvent.click(screen.getByRole("button", { name: "Solve challenge" }))
    expect(submit).toBeEnabled()

    fillAndSubmit()
    await vi.waitFor(() => expect(signUpMock).toHaveBeenCalled())
    expect(signUpMock.mock.calls[0]?.[1].get("cf-turnstile-response")).toBe("solved-token")
  })

  it("doesn't wait for a CAPTCHA that isn't configured (local development)", () => {
    render(<SignupForm />)
    expect(screen.getByRole("button", { name: "Create account" })).toBeEnabled()
    expect(screen.queryByRole("button", { name: "Solve challenge" })).not.toBeInTheDocument()
  })
})
