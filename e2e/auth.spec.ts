import { expect, test } from "@playwright/test"
import {
  completeOnboarding,
  newTestUser,
  signIn,
  signOut,
  signUp,
  signUpAndOnboard,
  workspaceSwitcher,
  type TestUser,
} from "./support/flows"
import { adminClient, deleteUsers, passwordResetLink, requireSupabase } from "./support/supabase"

/**
 * End-to-end account and workspace flows against a real Supabase (Auth,
 * PostgREST, Postgres with our migrations and RLS). Skipped locally when no
 * stack is running; required in CI.
 */
requireSupabase()

const created: TestUser[] = []
function testUser(label: string) {
  const user = newTestUser(label)
  created.push(user)
  return user
}

test.afterAll(async () => {
  await deleteUsers(created.map((user) => user.email))
})

test("a new user signs up, onboards, and keeps the right workspace across sessions", async ({
  page,
  browser,
}) => {
  const founder = testUser("founder")
  let slug = ""

  await test.step("1. sign up", async () => {
    await signUp(page, founder)
  })

  await test.step("2. onboarding appears (and can't be skipped)", async () => {
    await expect(page.getByRole("heading", { name: "Set up your workspace" })).toBeVisible()
    await page.goto("/dashboard")
    await expect(page).toHaveURL(/\/onboarding$/)
  })

  await test.step("3–4. create the workspace and reach its dashboard", async () => {
    slug = await completeOnboarding(page, founder)
    await expect(workspaceSwitcher(page, founder.workspaceName)).toBeVisible()
    await expect(page.getByText(`Welcome, ${founder.fullName.split(" ")[0]}`)).toBeVisible()
  })

  await test.step("5. a refresh keeps the session", async () => {
    await page.reload()
    await expect(page).toHaveURL(`/w/${slug}`)
    await expect(page.getByRole("heading", { level: 1, name: founder.workspaceName })).toBeVisible()
  })

  await test.step("signed-in users skip the auth pages and onboarding", async () => {
    await page.goto("/login")
    await expect(page).toHaveURL(`/w/${slug}`)
    await page.goto("/onboarding")
    await expect(page).toHaveURL(`/w/${slug}`)
  })

  await test.step("6. log out", async () => {
    await signOut(page)
    await page.goto(`/w/${slug}`)
    await expect(page).toHaveURL(`/login?next=${encodeURIComponent(`/w/${slug}`)}`)
  })

  await test.step("7–8. log back in and land in the same workspace", async () => {
    await page.goto("/login")
    await signIn(page, founder)
    await expect(page).toHaveURL(`/w/${slug}`)
    await expect(page.getByRole("heading", { level: 1, name: founder.workspaceName })).toBeVisible()
    await expect(workspaceSwitcher(page, founder.workspaceName)).toBeVisible()
  })

  await test.step("9. another tenant's workspace is not accessible", async () => {
    const otherContext = await browser.newContext()
    const otherPage = await otherContext.newPage()
    const outsider = testUser("outsider")
    const outsiderSlug = await signUpAndOnboard(otherPage, outsider)
    await otherContext.close()

    for (const path of [`/w/${outsiderSlug}`, `/w/${outsiderSlug}/settings`]) {
      await page.goto(path)
      await expect(page.getByRole("heading", { name: "Workspace not found" })).toBeVisible()
      await expect(page.getByText(outsider.workspaceName)).toHaveCount(0)
    }

    // The switcher only ever lists the founder's own workspace.
    await page.goto(`/w/${slug}`)
    await workspaceSwitcher(page, founder.workspaceName).click()
    const menu = page.getByRole("menu")
    await expect(menu.getByRole("menuitem", { name: founder.workspaceName })).toBeVisible()
    await expect(menu.getByText(outsider.workspaceName)).toHaveCount(0)
  })
})

test("a user can create a second workspace and switch between them", async ({ page }) => {
  const user = testUser("switcher")
  const firstSlug = await signUpAndOnboard(page, user)

  await workspaceSwitcher(page, user.workspaceName).click()
  await page.getByRole("menuitem", { name: "Create workspace" }).click()
  await expect(page).toHaveURL("/workspaces/new")
  await page.getByLabel("Workspace name").fill(`${user.workspaceName} two`)
  await page.getByRole("button", { name: "Create workspace" }).click()

  await expect(
    page.getByRole("heading", { level: 1, name: `${user.workspaceName} two` })
  ).toBeVisible()
  const secondSlug = new URL(page.url()).pathname.split("/")[2]
  expect(secondSlug).not.toBe(firstSlug)

  // Signing in again reopens the workspace used last on this device.
  await signOut(page)
  await signIn(page, user)
  await expect(page).toHaveURL(`/w/${secondSlug}`)

  await workspaceSwitcher(page, `${user.workspaceName} two`).click()
  await page.getByRole("menuitem", { name: user.workspaceName, exact: true }).click()
  await expect(page).toHaveURL(`/w/${firstSlug}`)
})

test("account and workspace settings can be updated", async ({ page }) => {
  const user = testUser("settings")
  const slug = await signUpAndOnboard(page, user)

  await test.step("update the display name", async () => {
    await page.goto(`/w/${slug}/settings/account`)
    await expect(page.getByLabel("Email")).toHaveValue(user.email)
    await page.getByLabel("Full name").fill("Grace Hopper")
    await page.getByRole("button", { name: "Save changes" }).click()
    await expect(page.getByText("Profile updated")).toBeVisible()
    await expect(page.getByRole("button", { name: "Account menu" })).toHaveText("GH")
  })

  await test.step("rename the workspace", async () => {
    await page.goto(`/w/${slug}/settings`)
    await page.getByLabel("Workspace name").fill(`${user.workspaceName} renamed`)
    await page.getByRole("button", { name: "Save changes" }).click()
    await expect(page.getByText("Workspace updated")).toBeVisible()
    await expect(workspaceSwitcher(page, `${user.workspaceName} renamed`)).toBeVisible()
  })

  const newSlug = `${slug}-new`
  await test.step("change the workspace URL", async () => {
    await page.getByLabel("Workspace URL").fill(newSlug)
    await expect(page.getByText(/breaks existing links/)).toBeVisible()
    await page.getByRole("button", { name: "Save changes" }).click()
    await expect(page).toHaveURL(`/w/${newSlug}/settings`)
    await page.goto(`/w/${slug}`)
    await expect(page.getByRole("heading", { name: "Workspace not found" })).toBeVisible()
  })

  await test.step("a reserved or taken URL is rejected on the field", async () => {
    await page.goto(`/w/${newSlug}/settings`)
    await page.getByLabel("Workspace URL").fill("admin")
    await page.getByRole("button", { name: "Save changes" }).click()
    await expect(page.getByText("That URL is reserved. Please choose another.")).toBeVisible()
  })

  await test.step("change the password (current password required)", async () => {
    await page.goto(`/w/${newSlug}/settings/account`)
    await page.getByLabel("Current password", { exact: true }).fill("not my password")
    await page.getByLabel("New password", { exact: true }).fill("a brand new passphrase")
    await page.getByLabel("Confirm new password", { exact: true }).fill("a brand new passphrase")
    await page.getByRole("button", { name: "Update password" }).click()
    await expect(page.getByText("That isn't your current password.")).toBeVisible()

    await page.getByLabel("Current password", { exact: true }).fill(user.password)
    await page.getByLabel("New password", { exact: true }).fill("a brand new passphrase")
    await page.getByLabel("Confirm new password", { exact: true }).fill("a brand new passphrase")
    await page.getByRole("button", { name: "Update password" }).click()
    await expect(page.getByText("Password updated")).toBeVisible()
  })

  await test.step("only the new password works afterwards", async () => {
    await signOut(page)
    await signIn(page, user)
    await expect(page.getByText("Incorrect email or password.")).toBeVisible()
    await signIn(page, user, "a brand new passphrase")
    await expect(page).toHaveURL(`/w/${newSlug}`)
  })
})

test("a forgotten password can be reset from the emailed link", async ({ page }) => {
  test.skip(!adminClient(), "Needs SUPABASE_SECRET_KEY to read the reset link")
  const user = testUser("reset")
  const slug = await signUpAndOnboard(page, user)
  await signOut(page)

  await page.goto("/forgot-password")
  await page.getByLabel("Email").fill(user.email)
  await page.getByRole("button", { name: "Send reset link" }).click()
  await expect(page.getByText("Check your email")).toBeVisible()

  await page.goto(await passwordResetLink(user.email))
  await expect(page).toHaveURL("/reset-password")
  await page.getByLabel("New password", { exact: true }).fill("recovered passphrase")
  await page.getByLabel("Confirm new password", { exact: true }).fill("recovered passphrase")
  await page.getByRole("button", { name: "Update password" }).click()
  await expect(page).toHaveURL(`/w/${slug}`)
  await expect(page.getByText("Password updated")).toBeVisible()

  await signOut(page)
  await signIn(page, user, "recovered passphrase")
  await expect(page).toHaveURL(`/w/${slug}`)
})

test("an ordinary session cannot use the reset page to skip the current password", async ({
  page,
}) => {
  const user = testUser("noreset")
  await signUpAndOnboard(page, user)
  await page.goto("/reset-password")
  await expect(page.getByRole("heading", { name: "This reset link has expired" })).toBeVisible()
  await expect(page.getByLabel("New password", { exact: true })).toHaveCount(0)
})

test("a tampered session cookie is rejected", async ({ page, context }) => {
  const user = testUser("tamper")
  const slug = await signUpAndOnboard(page, user)

  const cookies = await context.cookies()
  const session = cookies.filter((cookie) => /^sb-.+-auth-token(\.\d+)?$/.test(cookie.name))
  expect(session.length).toBeGreaterThan(0)
  await context.addCookies(session.map((cookie) => ({ ...cookie, value: "base64-tampered" })))

  await page.goto(`/w/${slug}`)
  await expect(page).toHaveURL(/\/login\?next=.*reason=session_expired/)
  await expect(page.getByText("Your session has ended. Please sign in again.")).toBeVisible()
})

test("an existing email can't be registered twice", async ({ page }) => {
  const user = testUser("duplicate")
  await signUpAndOnboard(page, user)
  await signOut(page)

  await page.goto("/signup")
  await page.getByLabel("Work email").fill(user.email)
  await page.getByLabel("Password", { exact: true }).fill("another passphrase")
  await page.getByRole("button", { name: "Create account" }).click()
  await expect(
    page.getByText("An account with this email already exists. Sign in instead.")
  ).toBeVisible()
})
