import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { signIn } from "../actions"
import { LoginForm } from "./login-form"

vi.mock("../actions", () => ({ signIn: vi.fn() }))

const signInMock = vi.mocked(signIn)

function submit(email: string, password: string) {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } })
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } })
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }))
}

describe("LoginForm", () => {
  beforeEach(() => {
    signInMock.mockReset()
  })

  it("sends credentials and the redirect target to the server", async () => {
    signInMock.mockResolvedValue({
      ok: false,
      error: { code: "UNAUTHENTICATED", message: "Incorrect email or password." },
    })
    render(<LoginForm next="/w/acme" />)

    submit("ada@example.com", "hunter2hunter2")
    await screen.findByText("Incorrect email or password.")

    const formData = signInMock.mock.calls[0]?.[1]
    expect(formData?.get("email")).toBe("ada@example.com")
    expect(formData?.get("password")).toBe("hunter2hunter2")
    expect(formData?.get("next")).toBe("/w/acme")
  })

  it("shows field errors next to the field and keeps the email", async () => {
    signInMock.mockResolvedValue({
      ok: false,
      error: {
        code: "VALIDATION",
        message: "Please check the highlighted fields and try again.",
        fieldErrors: { email: ["Enter a valid email address."] },
      },
    })
    render(<LoginForm />)

    submit("not-an-email", "whatever")
    const message = await screen.findByText("Enter a valid email address.")

    const email = screen.getByLabelText("Email")
    expect(email).toHaveAttribute("aria-invalid", "true")
    expect(email.getAttribute("aria-describedby")).toContain(message.id)
    expect(email).toHaveValue("not-an-email")
    // Field errors replace the generic form message.
    expect(screen.queryByText(/highlighted fields/)).not.toBeInTheDocument()
  })

  it("links to password recovery", () => {
    render(<LoginForm />)
    expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute(
      "href",
      "/forgot-password"
    )
  })
})
