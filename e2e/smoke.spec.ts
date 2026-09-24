import { expect, test } from "@playwright/test"

/**
 * Smoke suite: proves the app boots, serves its public surface and protects
 * its private one. Needs no Supabase: every path here resolves before any
 * network call to Supabase is made (validation fails first, or there is no
 * session to check).
 */

test("landing page renders with calls to action", async ({ page }) => {
  await page.goto("/")
  await expect(page).toHaveTitle(/DreamFunnels/)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await expect(page.getByRole("link", { name: "Start building free" })).toHaveAttribute(
    "href",
    "/signup"
  )
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login")
})

test("health endpoint responds with security headers", async ({ request }) => {
  const response = await request.get("/api/health")
  expect(response.ok()).toBe(true)
  expect(await response.json()).toMatchObject({ status: "ok", environment: "local" })

  const headers = response.headers()
  expect(headers["x-content-type-options"]).toBe("nosniff")
  expect(headers["x-frame-options"]).toBe("DENY")
  expect(headers["x-powered-by"]).toBeUndefined()
})

for (const path of [
  "/dashboard",
  "/onboarding",
  "/workspaces/new",
  "/w/acme",
  "/w/acme/settings",
]) {
  test(`anonymous visitors to ${path} are sent to login`, async ({ page }) => {
    await page.goto(path)
    await expect(page).toHaveURL(`/login?next=${encodeURIComponent(path)}`)
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible()
  })
}

test("login validates input on the server before calling Supabase", async ({ page }) => {
  await page.goto("/login")
  await page.getByLabel("Email").fill("not-an-email")
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page.getByText("Enter a valid email address.")).toBeVisible()
  await expect(page.getByText("Enter your password.")).toBeVisible()
  await expect(page.getByLabel("Email")).toHaveValue("not-an-email")
})

test("signup enforces the password policy", async ({ page }) => {
  await page.goto("/signup")
  await page.getByLabel("Work email").fill("new.founder@example.com")
  await page.getByLabel("Password", { exact: true }).fill("short")
  await page.getByRole("button", { name: "Create account" }).click()
  await expect(page.getByText("Use at least 8 characters.")).toBeVisible()
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("aria-invalid", "true")
})

test("forgot password validates the email (submitting with Enter)", async ({ page }) => {
  await page.goto("/forgot-password")
  await page.getByLabel("Email").fill("nope")
  await page.getByLabel("Email").press("Enter")
  await expect(page.getByText("Enter a valid email address.")).toBeVisible()
})

test("login submits with Enter from the password field", async ({ page }) => {
  await page.goto("/login")
  await page.getByLabel("Email").fill("still-not-an-email")
  await page.getByLabel("Password", { exact: true }).fill("whatever")
  await page.getByLabel("Password", { exact: true }).press("Enter")
  await expect(page.getByText("Enter a valid email address.")).toBeVisible()
})

test("auth pages link to each other", async ({ page }) => {
  await page.goto("/login")
  await page.getByRole("link", { name: "Create an account" }).click()
  await expect(page).toHaveURL("/signup")
  await page.getByRole("link", { name: "Sign in" }).click()
  await expect(page).toHaveURL("/login")
  await page.getByRole("link", { name: "Forgot password?" }).click()
  await expect(page).toHaveURL("/forgot-password")
})

test("an invalid sign-in link shows a recoverable error", async ({ page }) => {
  await page.goto("/auth/callback?next=/dashboard")
  await expect(page).toHaveURL(/\/login\?error=auth_callback_failed/)
  // Next's route announcer is also role="alert", so match on the message itself.
  await expect(page.getByText("That link is invalid or has expired")).toBeVisible()
})

test("an invalid password-reset link sends the user back to request a new one", async ({
  page,
}) => {
  await page.goto("/auth/callback?next=/reset-password")
  await expect(page).toHaveURL(/\/forgot-password\?error=reset_link_invalid/)
  await expect(page.getByText("That password reset link is invalid or has expired")).toBeVisible()
})

test("the reset page requires a recovery session", async ({ page }) => {
  await page.goto("/reset-password")
  await expect(page).toHaveURL(/\/forgot-password\?error=reset_link_invalid/)
})

test("the login page explains an ended session", async ({ page }) => {
  await page.goto("/login?reason=session_expired")
  await expect(page.getByText("Your session has ended. Please sign in again.")).toBeVisible()
})

test("unknown routes render the not-found page", async ({ page }) => {
  const response = await page.goto("/this-page-does-not-exist")
  expect(response?.status()).toBe(404)
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible()
})
