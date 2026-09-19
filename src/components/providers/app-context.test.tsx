import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { appContext } from "@/test/fixtures"
import { AppContextProvider, initialsOf, useCurrentWorkspace } from "./app-context"

function WorkspaceId() {
  return <p>{useCurrentWorkspace().id}</p>
}

describe("app context", () => {
  it("exposes the current workspace id to client components", () => {
    render(
      <AppContextProvider value={appContext}>
        <WorkspaceId />
      </AppContextProvider>
    )
    expect(screen.getByText(appContext.workspace.id)).toBeInTheDocument()
  })

  it("fails loudly when used outside a workspace", () => {
    // React logs the thrown error; keep the test output clean.
    const silence = vi.spyOn(globalThis.console, "error").mockImplementation(() => {})
    try {
      expect(() => render(<WorkspaceId />)).toThrow(/inside a workspace/)
    } finally {
      silence.mockRestore()
    }
  })
})

describe("initialsOf", () => {
  it.each([
    ["Ada Lovelace", null, "AL"],
    ["  grace  brewster  hopper ", null, "GB"],
    ["Cher", null, "C"],
    [null, "founder@example.com", "F"],
    ["   ", "founder@example.com", "F"],
    [null, null, "?"],
  ])("%j / %j -> %j", (name, email, expected) => {
    expect(initialsOf(name, email)).toBe(expected)
  })
})
