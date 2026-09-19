import { expect, type Locator, type Page } from "@playwright/test"

/** Unique, obviously fake accounts per test run. */
export function newTestUser(label: string) {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  return {
    email: `e2e-${label}-${id}@example.com`,
    password: `correct horse ${id}`,
    fullName: `${label[0]?.toUpperCase() ?? ""}${label.slice(1)} Tester`,
    workspaceName: `${label} ${id}`,
  }
}

export type TestUser = ReturnType<typeof newTestUser>

const passwordField = (page: Page, label = "Password") => page.getByLabel(label, { exact: true })

export async function signUp(page: Page, user: TestUser) {
  await page.goto("/signup")
  await page.getByLabel("Work email").fill(user.email)
  await passwordField(page).fill(user.password)
  await page.getByRole("button", { name: "Create account" }).click()
  await expect(page).toHaveURL(/\/onboarding$/)
}

/** Completes onboarding and returns the new workspace's slug. */
export async function completeOnboarding(page: Page, user: TestUser): Promise<string> {
  await expect(page.getByRole("heading", { name: "Set up your workspace" })).toBeVisible()
  await page.getByLabel("Your name").fill(user.fullName)
  await page.getByLabel("Workspace name").fill(user.workspaceName)
  await page.getByRole("button", { name: "Create workspace" }).click()

  await expect(page).toHaveURL(/\/w\/[a-z0-9-]+$/)
  await expect(page.getByRole("heading", { level: 1, name: user.workspaceName })).toBeVisible()
  const slug = new URL(page.url()).pathname.split("/")[2]
  if (!slug) throw new Error(`No workspace slug in ${page.url()}`)
  return slug
}

export async function signUpAndOnboard(page: Page, user: TestUser): Promise<string> {
  await signUp(page, user)
  return completeOnboarding(page, user)
}

export async function signIn(page: Page, user: TestUser, password = user.password) {
  if (!new URL(page.url()).pathname.startsWith("/login")) await page.goto("/login")
  await page.getByLabel("Email").fill(user.email)
  await passwordField(page).fill(password)
  await page.getByRole("button", { name: "Sign in" }).click()
}

/**
 * Opens a dropdown menu and returns it. A click that lands before the page has
 * hydrated (common on a cold `next dev`) opens nothing, so retry until it does.
 */
export async function openMenu(page: Page, trigger: Locator): Promise<Locator> {
  const menu = page.getByRole("menu")
  await expect(async () => {
    if (!(await menu.isVisible())) await trigger.click()
    await expect(menu).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 20_000 })
  return menu
}

export async function signOut(page: Page) {
  const menu = await openMenu(page, page.getByRole("button", { name: "Account menu" }))
  await menu.getByRole("menuitem", { name: "Sign out" }).click()
  await expect(page).toHaveURL(/\/login$/)
}

/** The workspace switcher's accessible name includes the current workspace. */
export function workspaceSwitcher(page: Page, workspaceName: string) {
  return page.getByRole("button", { name: `Current workspace: ${workspaceName}. Switch workspace` })
}

export function openWorkspaceSwitcher(page: Page, workspaceName: string): Promise<Locator> {
  return openMenu(page, workspaceSwitcher(page, workspaceName))
}
