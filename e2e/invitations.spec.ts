import { expect, test, type Browser, type Page } from "@playwright/test"
import { giveEachTestItsOwnIp, testClientIp } from "./support/client-ip"
import {
  newTestUser,
  openMenu,
  signIn,
  signUpAndOnboard,
  workspaceSwitcher,
  type TestUser,
} from "./support/flows"
import {
  deleteEmails,
  emailIdsTo,
  invitationPathFrom,
  waitForEmail,
  type CapturedEmail,
} from "./support/mailpit"
import {
  addMembership,
  adminClient,
  createConfirmedUser,
  deleteUsers,
  deleteWorkspaces,
  provisionAgencyWithClient,
  requireSupabase,
  signedInClient,
} from "./support/supabase"

/**
 * Sprint 3: client workspaces, members and invitations, end to end through
 * real Auth, PostgREST, RLS and email (captured by the local Mailpit). The
 * numbered journeys map to docs/QA.md "Sprint 3 coverage map".
 */
requireSupabase()
giveEachTestItsOwnIp()

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

/** A second browser, with its own client IP (auth rate limits are per IP). */
async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": testClientIp() },
  })
  return context.newPage()
}

async function invitationEmail(to: string, after: readonly string[] = []): Promise<CapturedEmail> {
  const email = await waitForEmail(to, { subject: /invited you to join/, after })
  emails.push(email.id)
  return email
}

/** An agency owner (signed in on `page`) with a client, made through the app's functions. */
async function agencyOwnerWithClient(page: Page, label: string) {
  const owner = testUser(label)
  await createConfirmedUser({ ...owner })
  const names = { agency: `${owner.workspaceName} Agency`, client: `${owner.workspaceName} Client` }
  const { agency, client } = await provisionAgencyWithClient(owner, names)
  workspaces.clients.push(client.id)
  workspaces.agencies.push(agency.id)
  await signIn(page, owner)
  await expect(page).toHaveURL(/\/w\//)
  return {
    owner,
    agency: { ...agency, name: names.agency },
    client: { ...client, name: names.client },
  }
}

/** Invites `email` from a workspace's Members page and waits for the email. */
async function inviteFromMembersPage(
  page: Page,
  workspaceSlug: string,
  email: string,
  role: "Member" | "Admin" = "Member"
) {
  await page.goto(`/w/${workspaceSlug}/settings/members`)
  await page.getByRole("button", { name: "Invite member" }).click()
  const dialog = page.getByRole("dialog", { name: /^Invite someone to/ })
  await dialog.getByLabel("Email").fill(email)
  await dialog.getByRole("radio", { name: new RegExp(`^${role}`) }).check()
  await dialog.getByRole("button", { name: "Send invitation" }).click()
  await expect(page.getByText("Invitation sent", { exact: true })).toBeVisible()
  await expect(dialog).toBeHidden()
  return invitationEmail(email)
}

test("1. an agency owner creates a client, invites its owner, and sees it pending", async ({
  page,
}) => {
  test.slow()
  const owner = testUser("agencyowner")
  const agencySlug = await signUpAndOnboard(page, owner)
  const clientOwnerEmail = newTestUser("clientowner").email
  const clientName = `Roofing ${owner.workspaceName}`

  await test.step("Clients is in the agency's navigation and starts empty", async () => {
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Clients" })
      .click()
    await expect(page).toHaveURL(`/w/${agencySlug}/clients`)
    await expect(page.getByRole("heading", { name: "No clients yet" })).toBeVisible()
  })

  let clientSlug = ""
  await test.step("add a client with its owner's email", async () => {
    await page.getByRole("link", { name: "Add client" }).first().click()
    await page.getByLabel("Business name").fill(clientName)
    await page.getByLabel("Business email").fill("hello@roofing.example")
    await page.getByLabel("Their email").fill(clientOwnerEmail)
    await expect(
      page.getByText(`We'll email an invitation to ${clientOwnerEmail} to join as an admin.`)
    ).toBeVisible()
    await page.getByRole("button", { name: "Create client workspace" }).click()

    await expect(page.getByRole("heading", { name: "Client workspace created" })).toBeVisible()
    await expect(page.getByText(`Invitation sent to ${clientOwnerEmail}.`)).toBeVisible()
    const open = page.getByRole("link", { name: `Open ${clientName}` })
    clientSlug = (await open.getAttribute("href"))?.split("/")[2] ?? ""
    expect(clientSlug).toMatch(/^roofing-/)
    const { data } = await adminClient()!
      .from("workspaces")
      .select("id")
      .eq("slug", clientSlug)
      .single()
    if (data) workspaces.clients.push(data.id)
  })

  await test.step("the invitation email names the client, the role and the link", async () => {
    const email = await invitationEmail(clientOwnerEmail)
    expect(email.to).toEqual([clientOwnerEmail])
    expect(email.subject).toBe(
      `${owner.fullName} invited you to join ${clientName} on DreamFunnels`
    )
    expect(email.text).toContain("as an admin")
    expect(email.text).toMatch(/This invitation expires on \w+ \d+, \d{4}\./)
    expect(invitationPathFrom(email)).toMatch(/^\/invite\/[A-Za-z0-9_-]{43}$/)
  })

  await test.step("the client is listed, pending its invitation", async () => {
    await page.getByRole("link", { name: "Back to clients" }).click()
    const row = page.getByRole("row", { name: new RegExp(clientName) })
    await expect(row).toContainText("Invitation pending")
    await expect(row).toContainText("hello@roofing.example")
  })

  await test.step("opening it shows the client, managed by the agency", async () => {
    await page.getByRole("link", { name: `Open ${clientName}` }).click()
    await expect(page).toHaveURL(`/w/${clientSlug}`)
    await expect(page.getByRole("heading", { level: 1, name: clientName })).toBeVisible()
    await expect(workspaceSwitcher(page, clientName)).toContainText(
      `Client of ${owner.workspaceName}`
    )
  })

  await test.step("its members page lists the pending invitation", async () => {
    await page.goto(`/w/${clientSlug}/settings/members`)
    await expect(
      page.getByText(/Owners and admins of .* can also manage this client/)
    ).toBeVisible()
    const invitation = page.getByRole("row", { name: new RegExp(clientOwnerEmail) })
    await expect(invitation).toContainText("Pending")
    await expect(invitation).toContainText("Admin")
  })
})

test("2. an existing user signs in from the invitation and lands in the client", async ({
  page,
  browser,
}) => {
  test.slow()
  const { client } = await agencyOwnerWithClient(page, "owner2")
  const existing = testUser("existing")
  await createConfirmedUser({ ...existing })

  const email = await inviteFromMembersPage(page, client.slug, existing.email)
  const invitee = await newPage(browser)
  await invitee.goto(invitationPathFrom(email))

  await expect(
    invitee.getByRole("heading", { name: `You're invited to join ${client.name}` })
  ).toBeVisible()
  await invitee.getByRole("link", { name: "Sign in to accept" }).click()
  await expect(invitee.getByText(/Sign in with the email address your invitation/)).toBeVisible()
  await signIn(invitee, existing)

  await expect(invitee.getByRole("heading", { name: `Join ${client.name}` })).toBeVisible()
  // They already have a name, so they aren't asked for one.
  await expect(invitee.getByLabel("Your name")).toHaveCount(0)
  await invitee.getByRole("button", { name: "Accept invitation" }).click()

  await expect(invitee).toHaveURL(`/w/${client.slug}`)
  await expect(invitee.getByRole("heading", { level: 1, name: client.name })).toBeVisible()
  await expect(workspaceSwitcher(invitee, client.name)).toBeVisible()

  // The link is spent.
  await invitee.goto(invitationPathFrom(email))
  await expect(invitee.getByRole("heading", { name: `You've joined ${client.name}` })).toBeVisible()
  await invitee.context().close()
})

test("3. a new person creates their account from the invitation and joins", async ({
  page,
  browser,
}) => {
  test.slow()
  const { client } = await agencyOwnerWithClient(page, "owner3")
  const newcomer = testUser("newcomer")
  const email = await inviteFromMembersPage(page, client.slug, newcomer.email, "Admin")

  const invitee = await newPage(browser)
  await invitee.goto(invitationPathFrom(email))
  await invitee.getByRole("link", { name: "Create an account" }).click()

  await expect(invitee.getByRole("heading", { name: `Join ${client.name}` })).toBeVisible()
  const emailField = invitee.getByLabel("Work email")
  await expect(emailField).toHaveValue(newcomer.email)
  await expect(emailField).toHaveAttribute("readonly", "")
  await invitee.getByLabel("Password", { exact: true }).fill(newcomer.password)
  await invitee.getByRole("button", { name: "Create account" }).click()

  // Back on the invitation (no onboarding detour), signed in as the invitee.
  await expect(invitee).toHaveURL(invitationPathFrom(email))
  await invitee.getByLabel("Your name").fill(newcomer.fullName)
  await invitee.getByRole("button", { name: "Accept invitation" }).click()

  await expect(invitee).toHaveURL(`/w/${client.slug}`)
  await invitee.goto(`/w/${client.slug}/settings/members`)
  const me = invitee.getByRole("row", { name: new RegExp(newcomer.fullName) })
  await expect(me).toContainText("You")
  await expect(me).toContainText("Admin")
  await invitee.context().close()
})

test("4. someone signed in with a different email can't accept, and can switch safely", async ({
  page,
  browser,
}) => {
  test.slow()
  const { client } = await agencyOwnerWithClient(page, "owner4")
  const intended = testUser("intended")
  const email = await inviteFromMembersPage(page, client.slug, intended.email)

  const other = testUser("other")
  await createConfirmedUser({ ...other })
  const wrong = await newPage(browser)
  await signIn(wrong, other)
  await expect(wrong).toHaveURL(/\/onboarding$/)
  await wrong.goto(invitationPathFrom(email))

  await expect(
    wrong.getByRole("heading", { name: "This invitation is for a different account" })
  ).toBeVisible()
  await expect(wrong.getByText(`It was sent to ${intended.email}`)).toBeVisible()
  await expect(wrong.getByRole("button", { name: "Accept invitation" })).toHaveCount(0)

  // The database refuses it too, whatever the UI shows.
  const otherApi = await signedInClient(other.email, other.password)
  const token = invitationPathFrom(email).split("/")[2]!
  const hash = await sha256Hex(token)
  const { data } = await otherApi.rpc("accept_workspace_invitation", { p_token_hash: hash })
  expect(data?.[0]?.outcome).toBe("email_mismatch")

  await wrong.getByRole("button", { name: "Sign out and continue" }).click()
  await expect(wrong).toHaveURL(invitationPathFrom(email))
  await expect(
    wrong.getByRole("heading", { name: `You're invited to join ${client.name}` })
  ).toBeVisible()
  await wrong.context().close()
})

test("5. an owner removes a member, who loses access to that workspace only", async ({
  page,
  browser,
}) => {
  test.slow()
  const { client } = await agencyOwnerWithClient(page, "owner5")
  const member = testUser("leaver")
  const memberId = await createConfirmedUser({ ...member })
  await addMembership(client.id, memberId, "member")

  const memberPage = await newPage(browser)
  await signIn(memberPage, member)
  await expect(memberPage).not.toHaveURL(/\/login/)
  await memberPage.goto(`/w/${client.slug}`)
  await expect(memberPage.getByRole("heading", { level: 1, name: client.name })).toBeVisible()

  await page.goto(`/w/${client.slug}/settings/members`)
  await openMenu(page, page.getByRole("button", { name: `Actions for ${member.fullName}` }))
  await page.getByRole("menuitem", { name: "Remove from workspace…" }).click()
  const dialog = page.getByRole("alertdialog", {
    name: `Remove ${member.fullName} from ${client.name}?`,
  })
  await dialog.getByRole("button", { name: "Remove member" }).click()
  await expect(page.getByText(`${member.fullName} was removed`)).toBeVisible()
  await expect(page.getByRole("row", { name: new RegExp(member.fullName) })).toHaveCount(0)

  await memberPage.reload()
  await expect(memberPage.getByRole("heading", { name: "Workspace not found" })).toBeVisible()
  // Their account still works: they can still sign in and reach onboarding.
  await memberPage.goto("/dashboard")
  await expect(memberPage).toHaveURL(/\/onboarding$/)
  await memberPage.context().close()
})

test("6. an admin can manage members but never an owner", async ({ page, browser }) => {
  test.slow()
  const { owner, agency } = await agencyOwnerWithClient(page, "owner6")
  const admin = testUser("agencyadmin")
  const adminId = await createConfirmedUser({ ...admin })
  await addMembership(agency.id, adminId, "admin")
  const member = testUser("plainmember")
  const memberId = await createConfirmedUser({ ...member })
  await addMembership(agency.id, memberId, "member")

  const adminPage = await newPage(browser)
  await signIn(adminPage, admin)
  await expect(adminPage).not.toHaveURL(/\/login/)
  await adminPage.goto(`/w/${agency.slug}/settings/members`)
  await expect(adminPage.getByRole("row", { name: new RegExp(owner.fullName) })).toBeVisible()
  await expect(
    adminPage.getByRole("button", { name: `Actions for ${owner.fullName}` })
  ).toHaveCount(0)
  await expect(
    adminPage.getByRole("button", { name: `Actions for ${admin.fullName}` })
  ).toHaveCount(0)

  await openMenu(
    adminPage,
    adminPage.getByRole("button", { name: `Actions for ${member.fullName}` })
  )
  await adminPage.getByRole("menuitem", { name: "Change role…" }).click()
  const dialog = adminPage.getByRole("dialog", { name: /^Change .* role$/ })
  await expect(dialog.getByRole("radio", { name: /^Owner/ })).toHaveCount(0)
  await dialog.getByRole("radio", { name: /^Admin/ }).check()
  await dialog.getByRole("button", { name: "Save role" }).click()
  await expect(adminPage.getByText(`${member.fullName} is now an admin`)).toBeVisible()

  // Going around the UI doesn't help: RLS leaves the owner's row alone.
  const adminApi = await signedInClient(admin.email, admin.password)
  const { data: owners } = await adminClient()!
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", agency.id)
    .eq("role", "owner")
  const { data: demoted } = await adminApi
    .from("workspace_members")
    .update({ role: "member" })
    .eq("workspace_id", agency.id)
    .eq("user_id", owners?.[0]?.user_id ?? "")
    .select("user_id")
  expect(demoted).toEqual([])
  const { error } = await adminApi
    .from("workspace_members")
    .update({ role: "owner" })
    .eq("workspace_id", agency.id)
    .eq("user_id", memberId)
  expect(error?.code).toBe("42501")
  await adminPage.context().close()
})

test("7. the last owner of a workspace can't be removed or demoted", async ({ page }) => {
  test.slow()
  const { client } = await agencyOwnerWithClient(page, "owner7")
  // A client whose only direct owner is someone from the business.
  const soleOwner = testUser("soleowner")
  const soleOwnerId = await createConfirmedUser({ ...soleOwner })
  await addMembership(client.id, soleOwnerId, "owner")

  await page.goto(`/w/${client.slug}/settings/members`)
  const actions = page.getByRole("button", { name: `Actions for ${soleOwner.fullName}` })

  await openMenu(page, actions)
  await page.getByRole("menuitem", { name: "Remove from workspace…" }).click()
  const confirm = page.getByRole("alertdialog")
  await confirm.getByRole("button", { name: "Remove member" }).click()
  await expect(confirm.getByRole("alert")).toContainText("needs at least one owner")
  await confirm.getByRole("button", { name: "Cancel" }).click()

  await openMenu(page, actions)
  await page.getByRole("menuitem", { name: "Change role…" }).click()
  const dialog = page.getByRole("dialog", { name: /^Change .* role$/ })
  await expect(dialog).toContainText("removes their ownership")
  await dialog.getByRole("button", { name: "Save role" }).click()
  await expect(dialog.getByRole("alert")).toContainText("needs at least one owner")

  const { data } = await adminClient()!
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", client.id)
    .eq("user_id", soleOwnerId)
    .single()
  expect(data?.role).toBe("owner")
})

test("resending replaces the link, revoking kills it, and expiry is enforced", async ({
  page,
  browser,
}) => {
  test.slow()
  const { client } = await agencyOwnerWithClient(page, "owner8")
  const invitee = testUser("resent")
  const first = await inviteFromMembersPage(page, client.slug, invitee.email)

  await test.step("a duplicate invite offers to resend instead", async () => {
    await page.getByRole("button", { name: "Invite member" }).click()
    const dialog = page.getByRole("dialog", { name: /^Invite someone to/ })
    await dialog.getByLabel("Email").fill(invitee.email.toUpperCase())
    await dialog.getByRole("button", { name: "Send invitation" }).click()
    await expect(dialog.getByText("This person already has a pending invitation.")).toBeVisible()
    await dialog.getByRole("button", { name: "Resend invitation" }).click()
    await expect(page.getByText("Invitation sent again")).toBeVisible()
  })

  const second = await invitationEmail(invitee.email, [first.id])
  expect(invitationPathFrom(second)).not.toBe(invitationPathFrom(first))
  const visitor = await newPage(browser)

  await test.step("the first link no longer works", async () => {
    await visitor.goto(invitationPathFrom(first))
    await expect(
      visitor.getByRole("heading", { name: "This invitation link isn't valid" })
    ).toBeVisible()
  })

  await test.step("an expired invitation says so", async () => {
    await adminClient()!
      .from("workspace_invitations")
      .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
      .eq("workspace_id", client.id)
      .eq("email", invitee.email)
    await visitor.goto(invitationPathFrom(second))
    await expect(
      visitor.getByRole("heading", { name: "This invitation has expired" })
    ).toBeVisible()
    await adminClient()!
      .from("workspace_invitations")
      .update({ expires_at: new Date(Date.now() + 86_400_000).toISOString() })
      .eq("workspace_id", client.id)
      .eq("email", invitee.email)
  })

  await test.step("revoking it stops the current link too", async () => {
    await page.reload()
    await openMenu(
      page,
      page.getByRole("button", { name: `Actions for the invitation to ${invitee.email}` })
    )
    await page.getByRole("menuitem", { name: "Revoke invitation…" }).click()
    const dialog = page.getByRole("alertdialog")
    await expect(dialog).toContainText("This link will stop working.")
    await dialog.getByRole("button", { name: "Revoke invitation" }).click()
    await expect(page.getByText("Invitation revoked")).toBeVisible()
    await expect(page.getByText("No pending invitations")).toBeVisible()

    await visitor.goto(invitationPathFrom(second))
    await expect(
      visitor.getByRole("heading", { name: "This invitation was cancelled" })
    ).toBeVisible()
  })

  // Only two emails were sent: the invitation and the resend.
  expect(await emailIdsTo(invitee.email)).toHaveLength(2)
  await visitor.context().close()
})

test("the invitation page is never cached and hides its token from other sites", async ({
  page,
  request,
}) => {
  const { client } = await agencyOwnerWithClient(page, "owner9")
  const email = await inviteFromMembersPage(page, client.slug, newTestUser("cache").email)
  const response = await request.get(invitationPathFrom(email))
  // Rendered per request in both modes: `next start` sends "private, no-cache,
  // no-store, max-age=0, must-revalidate", `next dev` "no-cache, must-revalidate".
  const cacheControl = response.headers()["cache-control"] ?? ""
  expect(cacheControl).toMatch(/no-cache/)
  expect(cacheControl).not.toMatch(/public|s-maxage|immutable/)
  const html = await response.text()
  expect(html).toContain('name="referrer" content="no-referrer"')
  expect(html).toContain('name="robots" content="noindex, nofollow"')
})

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return Buffer.from(digest).toString("hex")
}
