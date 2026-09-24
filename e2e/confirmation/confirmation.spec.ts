import { expect, test, type Browser, type Page } from "@playwright/test"
import { giveEachTestItsOwnIp, testClientIp } from "../support/client-ip"
import { completeOnboarding, newTestUser, signIn, type TestUser } from "../support/flows"
import {
  authCallbackPathFrom,
  deleteEmails,
  invitationPathFrom,
  waitForEmail,
  type CapturedEmail,
} from "../support/mailpit"
import {
  adminClient,
  createConfirmedUser,
  deleteUsers,
  deleteWorkspaces,
  provisionAgencyWithClient,
  requireSupabase,
} from "../support/supabase"

/**
 * Email confirmation ON (what staging and production run), end to end with
 * the links read from Mailpit: the `e2e-confirmation` CI job starts a stack
 * with supabase/config.toml's confirmation switched on
 * (scripts/ci/enable-email-confirmation.mts). Against a stack without it the
 * spec skips, or fails when E2E_REQUIRE_EMAIL_CONFIRMATION=1.
 */
requireSupabase()
giveEachTestItsOwnIp()

test.beforeAll(async () => {
  const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "" },
  })
  const settings = (await response.json()) as { mailer_autoconfirm?: boolean }
  const confirmationOn = settings.mailer_autoconfirm === false
  if (!confirmationOn && process.env.E2E_REQUIRE_EMAIL_CONFIRMATION === "1") {
    throw new Error("E2E_REQUIRE_EMAIL_CONFIRMATION=1 but the stack auto-confirms sign-ups")
  }
  test.skip(!confirmationOn, "Needs a Supabase stack with email confirmation on (see the CI job).")
})
test.skip(!adminClient(), "Needs SUPABASE_SECRET_KEY for fixtures and cleanup")

const users: TestUser[] = []
const workspaces = { clients: [] as string[], agencies: [] as string[] }
const emails: string[] = []

function testUser(label: string) {
  const user = newTestUser(label)
  users.push(user)
  return user
}

test.afterAll(async () => {
  await deleteWorkspaces(workspaces)
  await deleteUsers(users.map((user) => user.email))
  await deleteEmails(emails)
})

async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": testClientIp() },
  })
  return context.newPage()
}

async function captured(to: string, subject: RegExp): Promise<CapturedEmail> {
  const email = await waitForEmail(to, { subject })
  emails.push(email.id)
  return email
}

const confirmationEmail = (to: string) => captured(to, /Confirm your DreamFunnels account/)

/** An agency owner signed in on `page`, who invites `email` from the agency's Members page. */
async function ownerInvites(page: Page, label: string, email: string) {
  const owner = testUser(label)
  await createConfirmedUser({ ...owner })
  const names = { agency: `${owner.workspaceName} Agency`, client: `${owner.workspaceName} Client` }
  const { agency, client } = await provisionAgencyWithClient(owner, names)
  workspaces.agencies.push(agency.id)
  workspaces.clients.push(client.id)

  await signIn(page, owner)
  await expect(page).not.toHaveURL(/\/login/)
  await page.goto(`/w/${agency.slug}/settings/members`)
  await page.getByRole("button", { name: "Invite member" }).click()
  const dialog = page.getByRole("dialog", { name: /^Invite someone to/ })
  await dialog.getByLabel("Email").fill(email)
  await dialog.getByRole("radio", { name: /^Member/ }).check()
  await dialog.getByRole("button", { name: "Send invitation" }).click()
  await expect(page.getByText("Invitation sent", { exact: true })).toBeVisible()
  const invitation = await captured(email, /invited you to join/)
  return {
    agency: { ...agency, name: names.agency },
    client,
    invitationPath: invitationPathFrom(invitation),
  }
}

/** Opens an invitation and creates the account from it; stops at "Check your email". */
async function signUpFromInvitation(page: Page, invitationPath: string, user: TestUser) {
  await page.goto(invitationPath)
  await page.getByRole("link", { name: "Create an account" }).click()
  await expect(page.getByLabel("Work email")).toHaveValue(user.email)
  await page.getByLabel("Password", { exact: true }).fill(user.password)
  await page.getByRole("button", { name: "Create account" }).click()
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible()
}

test("sign up → confirmation email → link → session → onboarding → workspace", async ({ page }) => {
  test.slow()
  const user = testUser("confirm")

  await page.goto("/signup")
  await page.getByLabel("Work email").fill(user.email)
  await page.getByLabel("Password", { exact: true }).fill(user.password)
  await page.getByRole("button", { name: "Create account" }).click()
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible()

  // No session before confirming: the app still sends them to sign in.
  await page.goto("/dashboard")
  await expect(page).toHaveURL(/\/login/)

  const link = authCallbackPathFrom(await confirmationEmail(user.email))
  // The app signs up with the PKCE flow, so GoTrue prefixes the hash with `pkce_`;
  // the token_hash template still verifies it on any device (see the cross-device test).
  expect(link).toMatch(/token_hash=[\w-]+&type=email&next=\/dashboard$/)
  await page.goto(link)
  await expect(page).toHaveURL(/\/onboarding$/)
  const slug = await completeOnboarding(page, user)
  const { data } = await adminClient()!.from("workspaces").select("id").eq("slug", slug).single()
  if (data) workspaces.agencies.push(data.id as string)
})

test("an invitee signs up, confirms in the same browser, returns to the invitation and joins", async ({
  page,
  browser,
}) => {
  test.slow()
  const invitee = testUser("sameinvitee")
  const { agency, client, invitationPath } = await ownerInvites(page, "sameowner", invitee.email)

  const inviteePage = await newPage(browser)
  await signUpFromInvitation(inviteePage, invitationPath, invitee)

  // Same browser: the pending-invitation cookie brings them back to it.
  await inviteePage.goto(authCallbackPathFrom(await confirmationEmail(invitee.email)))
  await expect(inviteePage).toHaveURL(invitationPath)
  await expect(inviteePage.getByRole("heading", { name: `Join ${agency.name}` })).toBeVisible()
  await inviteePage.getByLabel("Your name").fill(invitee.fullName)
  await inviteePage.getByRole("button", { name: "Accept invitation" }).click()
  await expect(inviteePage).toHaveURL(`/w/${agency.slug}`)

  // A member of the agency, nothing more: its client stays out of reach.
  await inviteePage.goto(`/w/${client.slug}`)
  await expect(inviteePage.getByRole("heading", { name: "Workspace not found" })).toBeVisible()
  await inviteePage.context().close()
})

test("cross-device: confirmed without the cookie, the invitation waits on onboarding", async ({
  page,
  browser,
}) => {
  test.slow()
  const invitee = testUser("otherdevice")
  const { agency, invitationPath } = await ownerInvites(page, "deviceowner", invitee.email)

  const laptop = await newPage(browser)
  await signUpFromInvitation(laptop, invitationPath, invitee)
  await laptop.context().close()

  // The confirmation link opened on another device: no pending-invitation cookie.
  const phone = await newPage(browser)
  await phone.goto(authCallbackPathFrom(await confirmationEmail(invitee.email)))
  await expect(phone).toHaveURL(/\/onboarding$/)
  await expect(phone.getByRole("heading", { name: "You have pending invitations" })).toBeVisible()
  const list = phone.getByRole("list", { name: "Pending invitations" })
  await expect(list.getByRole("listitem")).toHaveCount(1)
  await expect(list).toContainText(agency.name)
  await expect(list).toContainText("as a member")

  await phone.getByLabel("Your name for the team you join").fill(invitee.fullName)
  await phone.getByRole("button", { name: `Accept invitation to ${agency.name}` }).click()
  await expect(phone).toHaveURL(`/w/${agency.slug}`)
  await phone.goto(`/w/${agency.slug}/settings/members`)
  await expect(phone.getByRole("row", { name: new RegExp(invitee.fullName) })).toContainText("You")
  await phone.context().close()
})
