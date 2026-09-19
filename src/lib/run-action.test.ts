import { redirect } from "next/navigation"
import { describe, expect, it, vi } from "vitest"
import { AppError } from "./errors"
import { setErrorReporter } from "./monitoring"
import { runAction } from "./run-action"

describe("runAction", () => {
  it("returns the result of a successful action", async () => {
    await expect(runAction("test.ok", async () => 42)).resolves.toEqual({ ok: true, data: 42 })
  })

  it("turns expected AppErrors into typed failures without reporting them", async () => {
    const captureException = vi.fn()
    setErrorReporter({ captureException })

    const result = await runAction("test.forbidden", async () => {
      throw new AppError("FORBIDDEN", "internal detail")
    })

    expect(result).toEqual({
      ok: false,
      error: { code: "FORBIDDEN", message: "You don't have permission to do that." },
    })
    expect(captureException).not.toHaveBeenCalled()
    setErrorReporter(null)
  })

  it("keeps per-field messages so forms can show them next to the input", async () => {
    const result = await runAction("test.conflict", async () => {
      throw new AppError("CONFLICT", "slug taken", {
        fieldErrors: { slug: ["That URL is already taken."] },
      })
    })

    expect(result).toEqual({
      ok: false,
      error: {
        code: "CONFLICT",
        message: "That conflicts with existing data. Please refresh and try again.",
        fieldErrors: { slug: ["That URL is already taken."] },
      },
    })
  })

  it("reports unexpected errors and hides their details", async () => {
    const captureException = vi.fn()
    setErrorReporter({ captureException })
    const boom = new Error("connection string postgres://user:pass@host")

    const result = await runAction("test.crash", async () => {
      throw boom
    })

    expect(result).toEqual({
      ok: false,
      error: { code: "INTERNAL", message: "Something went wrong on our side. Please try again." },
    })
    expect(captureException).toHaveBeenCalledWith(boom, { action: "test.crash" })
    setErrorReporter(null)
  })

  it("lets Next.js redirects propagate", async () => {
    await expect(
      runAction("test.redirect", async () => {
        redirect("/login")
      })
    ).rejects.toMatchObject({ digest: expect.stringContaining("NEXT_REDIRECT") })
  })
})
