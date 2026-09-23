import { render, screen } from "@testing-library/react"
import { useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { TurnstileWidget } from "./turnstile-widget"

vi.mock("next/script", () => ({ default: () => null }))

type RenderOptions = { callback: (token: string) => void; action: string; sitekey: string }

let rendered: RenderOptions | null
const turnstile = {
  render: vi.fn((_container: HTMLElement, options: RenderOptions) => {
    rendered = options
    return "widget-1"
  }),
  reset: vi.fn(),
  remove: vi.fn(),
}

beforeEach(() => {
  rendered = null
  turnstile.render.mockClear()
  turnstile.reset.mockClear()
  turnstile.remove.mockClear()
  window.turnstile = turnstile as unknown as NonNullable<Window["turnstile"]>
})

afterEach(() => {
  delete window.turnstile
})

function Harness({ resetKey }: { resetKey: number }) {
  const [token, setToken] = useState<string | null>(null)
  return (
    <form aria-label="Sign up">
      <TurnstileWidget
        action="signup"
        siteKey="site-key"
        onTokenChange={setToken}
        resetKey={resetKey}
      />
      <output>{token ?? "no token"}</output>
    </form>
  )
}

describe("TurnstileWidget", () => {
  it("renders nothing, and loads nothing, without a site key", () => {
    const { container } = render(
      <TurnstileWidget action="signup" siteKey={null} onTokenChange={() => {}} />
    )
    expect(container).toBeEmptyDOMElement()
    expect(turnstile.render).not.toHaveBeenCalled()
  })

  it("renders the challenge for the form's action and reports the token", async () => {
    render(<Harness resetKey={0} />)

    expect(turnstile.render).toHaveBeenCalledTimes(1)
    expect(rendered).toMatchObject({ sitekey: "site-key", action: "signup" })
    expect(screen.getByText("no token")).toBeInTheDocument()

    rendered?.callback("solved-token")
    expect(await screen.findByText("solved-token")).toBeInTheDocument()
  })

  it("asks for a fresh token after each submission, since tokens are single-use", async () => {
    const { rerender } = render(<Harness resetKey={0} />)
    rendered?.callback("solved-token")
    await screen.findByText("solved-token")

    rerender(<Harness resetKey={1} />)
    expect(turnstile.reset).toHaveBeenCalledWith("widget-1")
    expect(await screen.findByText("no token")).toBeInTheDocument()
  })

  it("removes the widget when unmounted", () => {
    const { unmount } = render(<Harness resetKey={0} />)
    unmount()
    expect(turnstile.remove).toHaveBeenCalledWith("widget-1")
  })
})
