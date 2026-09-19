import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { NewWorkspaceFields } from "./new-workspace-fields"

describe("NewWorkspaceFields", () => {
  it("previews the URL that will be generated from the name", () => {
    render(<NewWorkspaceFields />)
    fireEvent.change(screen.getByLabelText("Workspace name"), {
      target: { value: "Café Münster & Co." },
    })

    const slug = screen.getByLabelText(/Workspace URL/)
    expect(slug).toHaveAttribute("placeholder", "cafe-munster-co")
    expect(slug).toHaveAccessibleDescription(/Leave blank to use “cafe-munster-co”/)
  })

  it("formats what the user types into a URL-friendly slug", () => {
    render(<NewWorkspaceFields />)
    const slug = screen.getByLabelText(/Workspace URL/)
    fireEvent.change(slug, { target: { value: "My Brand_Name" } })
    expect(slug).toHaveValue("my-brand-name")
  })

  it("shows server errors on the right fields", () => {
    render(
      <NewWorkspaceFields
        errors={{
          workspaceName: ["Enter a workspace name."],
          workspaceSlug: ["That URL is already taken. Please try another."],
        }}
      />
    )
    expect(screen.getByLabelText("Workspace name")).toHaveAccessibleDescription(
      /Enter a workspace name\./
    )
    expect(screen.getByLabelText(/Workspace URL/)).toHaveAccessibleDescription(/already taken/)
  })
})
