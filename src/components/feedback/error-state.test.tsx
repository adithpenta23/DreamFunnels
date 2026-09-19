import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ErrorState } from "./error-state"

describe("ErrorState", () => {
  it("announces the error and shows the support reference", () => {
    render(<ErrorState digest="abc123" />)
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong")
    expect(screen.getByText("Reference: abc123")).toBeInTheDocument()
  })

  it("calls onRetry when the user tries again", () => {
    const onRetry = vi.fn()
    render(<ErrorState onRetry={onRetry} />)
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it("hides the retry button when recovery isn't possible", () => {
    render(<ErrorState title="Gone" />)
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })
})
