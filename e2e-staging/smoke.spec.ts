import { expect, test, type Browser, type Page } from "@playwright/test"
import { signOut } from "../e2e/support/flows"
import {
  cleanUpStagingRun,
  confirmationPath,
  createConfirmedStagingUser,
  invitationDelivery,
  recordWorkspace,
  stagingUser,
  workspaceIdBySlug,
} from "./support/staging"

/**
 * The staging smoke: one journey through the hosted stack, in order.
 * landing → sign-up (Turnstile test keys) → confirmation (admin-API link) →
 * onboarding → workspace → client → invitation (Resend accepted it) → the
 * invitee accepts from their pending invitations → member visible → role
 * limits → forbidden workspace → sign out → sign in again.
 *
 * Real inboxes are checked by hand (docs/DEPLOYMENT.md "Manual checks").
 */

test.describe.configure({ mode: "serial" })

test.afterAll(async () => {
  await cleanUpStagingRun()
})

const slugFrom = (page: Page) => new URL(page.url()).pathname.split("/")[2] ?? ""

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password", { exact: true }).fill(password)
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

async function newPage(browser: Browser) {
  return (await browser.newContext()).newPage()
}

test("the core journey works on staging", async ({ page, browser }) => {
  const owner = stagingUser("owner")
  const invitee = stagingUser("invitee")
  const workspaceName = `Smoke ${Date.now().toString(36)}`
  const clientName = `Smoke Client ${Date.now().toString(36)}`
  let agencySlug = ""
  let agencyId = ""

  await test.step("the landing page renders", async () => {
    await page.goto("/")
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    await expect(page.getByRole("link", { name: "Start building free" })).toBeVisible()
  })

  await test.step("sign up through the real Turnstile widget (test keys)", async () => {
    await page.goto("/signup")
    await page.getByLabel("Work email").fill(owner.email)
    await page.getByLabel("Password", { exact: true }).fill(owner.password)
    const submit = page.getByRole("button", { name: "Create account" })
    // The button waits for Turnstile's token: proves the widget loaded and passed.
    await expect(submit).toBeEnabled({ timeout: 30_000 })
    await submit.click()
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible()
  })

  await test.step("confirm the email and land in onboarding with a session", async () => {
    await page.goto(await confirmationPath(owner))
    await expect(page).toHaveURL(/\/onboarding$/)
    await page.getByLabel("Your name").fill(owner.fullName)
    await page.getByLabel("Workspace name").fill(workspaceName)
    await page.getByRole("button", { name: "Create workspace" }).click()
    await expect(page).toHaveURL(/\/w\/[a-z0-9-]+$/)
    await expect(page.getByRole("heading", { level: 1, name: workspaceName })).toBeVisible()
    agencySlug = slugFrom(page)
    agencyId = await workspaceIdBySlug(agencySlug)
    recordWorkspace(agencyId)
  })

  await test.step("add a client workspace", async () => {
    await page.goto(`/w/${agencySlug}/clients/new`)
    await page.getByLabel("Business name").fill(clientName)
    await page.getByRole("button", { name: "Create client workspace" }).click()
    await expect(page.getByRole("heading", { name: "Client workspace created" })).toBeVisible()
    const open = page.getByRole("link", { name: `Open ${clientName}` })
    const clientSlug = (await open.getAttribute("href"))?.split("/")[2] ?? ""
    recordWorkspace(await workspaceIdBySlug(clientSlug))
  })

  await test.step("invite someone; Resend accepts the email", async () => {
    await page.goto(`/w/${agencySlug}/settings/members`)
    await page.getByRole("button", { name: "Invite member" }).click()
    const dialog = page.getByRole("dialog", { name: /^Invite someone to/ })
    await dialog.getByLabel("Email").fill(invitee.email)
    await dialog.getByRole("radio", { name: /^Member/ }).check()
    await dialog.getByRole("button", { name: "Send invitation" }).click()
    await expect(page.getByText("Invitation sent", { exact: true })).toBeVisible()
    await expect
      .poll(() => invitationDelivery(agencyId, invitee.email), { timeout: 30_000 })
      .toBe("sent")
  })

  const inviteePage = await newPage(browser)
  await test.step("the invitee accepts from their pending invitations", async () => {
    await createConfirmedStagingUser(invitee)
    await signIn(inviteePage, invitee.email, invitee.password)
    await expect(inviteePage).toHaveURL(/\/onboarding$/)
    await expect(
      inviteePage.getByRole("heading", { name: "You have pending invitations" })
    ).toBeVisible()
    await inviteePage.getByRole("button", { name: `Accept invitation to ${workspaceName}` }).click()
    await expect(inviteePage).toHaveURL(`/w/${agencySlug}`)
  })

  await test.step("the owner sees the new member", async () => {
    await page.goto(`/w/${agencySlug}/settings/members`)
    await expect(page.getByRole("cell", { name: new RegExp(invitee.fullName) })).toBeVisible()
  })

  await test.step("a member gets a member's view", async () => {
    await inviteePage.goto(`/w/${agencySlug}/settings/members`)
    await expect(inviteePage.getByRole("button", { name: "Invite member" })).toBeHidden()
    await expect(
      inviteePage
        .getByRole("navigation", { name: "Settings" })
        .getByRole("link", { name: "Audit log" })
    ).toBeHidden()
    await inviteePage.goto(`/w/${agencySlug}/settings/audit-log`)
    await expect(
      inviteePage.getByRole("heading", { name: "Only owners and admins can view the audit log" })
    ).toBeVisible()
  })

  await test.step("a workspace they don't belong to is not found", async () => {
    const { client } = await clientSlugOf(page, agencySlug, clientName)
    await inviteePage.goto(`/w/${client}`)
    await expect(inviteePage.getByRole("heading", { name: "Workspace not found" })).toBeVisible()
  })

  await test.step("sign out, then sign in again", async () => {
    await signOut(inviteePage)
    await signIn(inviteePage, invitee.email, invitee.password)
    await expect(inviteePage).toHaveURL(`/w/${agencySlug}`)
  })
})

async function clientSlugOf(page: Page, agencySlug: string, clientName: string) {
  await page.goto(`/w/${agencySlug}/clients`)
  const link = page.getByRole("link", { name: clientName, exact: true })
  return { client: (await link.getAttribute("href"))?.split("/")[2] ?? "" }
}
