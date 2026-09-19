import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { FormField } from "./form-field"
import { PasswordInput } from "./password-input"

describe("PasswordInput", () => {
  it("hides the password until the user asks to see it", () => {
    render(
      <FormField id="password" label="Password">
        <PasswordInput name="password" />
      </FormField>
    )
    const input = screen.getByLabelText("Password")
    expect(input).toHaveAttribute("type", "password")

    const toggle = screen.getByRole("button", { name: "Show password" })
    expect(toggle).toHaveAttribute("aria-pressed", "false")
    fireEvent.click(toggle)

    expect(input).toHaveAttribute("type", "text")
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
  })
})

describe("FormField", () => {
  it("connects the hint and the error to the control", () => {
    render(
      <FormField
        id="name"
        label="Name"
        hint="As it appears to your team"
        error={["Enter your name."]}
      >
        <input />
      </FormField>
    )
    const input = screen.getByLabelText("Name")
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(input).toHaveAccessibleDescription("As it appears to your team Enter your name.")
  })

  it("marks nothing invalid without an error", () => {
    render(
      <FormField id="name" label="Name">
        <input />
      </FormField>
    )
    expect(screen.getByLabelText("Name")).not.toHaveAttribute("aria-invalid")
  })
})
