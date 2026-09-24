import { createHash, randomBytes } from "node:crypto"
import { expect, test, type Browser, type Page } from "@playwright/test"
import { giveEachTestItsOwnIp, testClientIp } from "./support/client-ip"
import { newTestUser, openMenu, signIn, type TestUser } from "./support/flows"
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
 * Sprint 4 journeys through the UI, against the local stack (no email
 * confirmation needed): transferring ownership, making a client's
 * representative its owner, leaving, the audit log, the onboarding
 * pending-invitation list, client search, and 375px layouts. Concurrency is
 * in ownership-api.spec.ts.
 */
requireSupabase()
giveEachTestItsOwnIp()

test.skip(!adminClient(), "Needs SUPABASE_SECRET_KEY for fixtures and cleanup")

const users: TestUser[] = []
const workspaces = { clients: [] as string[], agencies: [] as string[] }

function testUser(label: string) {
  const user = newTestUser(label)
  users.push(user)
  return user
}

test.afterAll(async () => {
  await deleteWorkspaces(workspaces)
  await deleteUsers(users.map((user) => user.email))
})

async function newPage(browser: Browser, viewport?: { width: number; height: number }) {
  const context = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": testClientIp() },
    ...(viewport ? { viewport } : {}),
  })
  return context.newPage()
}

/** An agency owner with a client, both made through the app's functions. */
async function agencyWithClient(label: string) {
  const owner = testUser(label)
  const ownerId = await createConfirmedUser({ ...owner })
  const names = { agency: `${owner.workspaceName} Agency`, client: `${owner.workspaceName} Client` }
  const { agency, client } = await provisionAgencyWithClient(owner, names)
  workspaces.agencies.push(agency.id)
  workspaces.clients.push(client.id)
  return {
    owner,
    ownerId,
    agency: { ...agency, name: names.agency },
    client: { ...client, name: names.client },
  }
}

async function member(label: string, workspaceId: string, role: "member" | "admin" | "owner") {
  const user = testUser(label)
  const id = await createConfirmedUser({ ...user })
  await addMembership(workspaceId, id, role)
  return { user, id }
}

async function signedIn(page: Page, user: TestUser) {
  await signIn(page, user)
  await expect(page).not.toHaveURL(/\/login/)
}

/** No sideways scrolling at the current viewport. */
async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

async function rolesIn(workspaceId: string) {
  const { data } = await adminClient()!
    .from("workspace_members")
    .select("user_id, role")
    .eq("workspace_id", workspaceId)
  return Object.fromEntries((data ?? []).map((row) => [row.user_id, row.role]))
}

test("a direct owner transfers ownership, becomes an admin, and can then leave", async ({
  page,
}) => {
  test.slow()
  const { owner, ownerId, agency, client } = await agencyWithClient("transferor")
  const sarah = await member("sarah", agency.id, "member")
  await signedIn(page, owner)

  await test.step("transfer from the member's menu, confirming with the workspace name", async () => {
    await page.goto(`/w/${agency.slug}/settings/members`)
    await openMenu(page, page.getByRole("button", { name: `Actions for ${sarah.user.fullName}` }))
    await page.getByRole("menuitem", { name: "Transfer ownership…" }).click()
    const dialog = page.getByRole("dialog", {
      name: `Transfer ownership to ${sarah.user.fullName}?`,
    })
    await expect(dialog).toContainText(
      `${sarah.user.fullName} will become the workspace owner and you will become an admin.`
    )
    const confirm = dialog.getByRole("button", { name: "Transfer ownership" })
    await expect(confirm).toBeDisabled()
    await dialog.getByLabel(/to confirm/).fill(agency.name)
    await confirm.click()
    await expect(dialog).toBeHidden()
    await expect(
      page.getByText(`${sarah.user.fullName} is now the owner of ${agency.name}`)
    ).toBeVisible()

    await expect(page.getByRole("row", { name: new RegExp(sarah.user.fullName) })).toContainText(
      "Owner"
    )
    await expect(page.getByRole("row", { name: new RegExp(owner.fullName) })).toContainText("Admin")
    expect(await rolesIn(agency.id)).toEqual({ [ownerId]: "admin", [sarah.id]: "owner" })
  })

  await test.step("the audit log says it in words", async () => {
    await page.goto(`/w/${agency.slug}/settings/audit-log`)
    await expect(
      page.getByRole("cell", {
        // At desktop width the action has its own column; the details are the sentence.
        name: `${sarah.user.fullName} became workspace owner; ${owner.fullName} became admin.`,
      })
    ).toBeVisible()
  })

  await test.step("the former owner leaves, and lands somewhere they still belong", async () => {
    await page.goto(`/w/${agency.slug}/settings`)
    await page.getByRole("button", { name: "Leave workspace…" }).click()
    const dialog = page.getByRole("alertdialog", { name: `Leave ${agency.name}?` })
    await expect(dialog).toContainText("You'll lose access to this workspace.")
    await dialog.getByRole("button", { name: "Leave workspace" }).click()
    // Their only other access (the client) came through the agency, so it's gone too.
    await expect(page).toHaveURL(/\/onboarding$/)
    await page.goto(`/w/${agency.slug}`)
    await expect(page.getByRole("heading", { name: "Workspace not found" })).toBeVisible()
    await page.goto(`/w/${client.slug}`)
    await expect(page.getByRole("heading", { name: "Workspace not found" })).toBeVisible()
  })
})

test("an agency owner makes a client's representative its owner; no transfer without a direct row", async ({
  page,
}) => {
  test.slow()
  const { owner, agency, client } = await agencyWithClient("makeowner")
  const rep = await member("rep", client.id, "member")
  await signedIn(page, owner)

  await page.goto(`/w/${client.slug}/settings/members`)
  const menu = await openMenu(
    page,
    page.getByRole("button", { name: `Actions for ${rep.user.fullName}` })
  )
  await expect(menu.getByRole("menuitem", { name: "Transfer ownership…" })).toBeHidden()
  await menu.getByRole("menuitem", { name: "Make owner…" }).click()
  const dialog = page.getByRole("alertdialog", {
    name: `Make ${rep.user.fullName} an owner of ${client.name}?`,
  })
  await dialog.getByRole("button", { name: "Make owner" }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole("row", { name: new RegExp(rep.user.fullName) })).toContainText(
    "Owner"
  )

  // Agency staff are never added to the client's members.
  const roles = await rolesIn(client.id)
  expect(roles).toEqual({ [rep.id]: "owner" })

  // …and an agency workspace offers no "Make owner".
  const staff = await member("staff", agency.id, "member")
  await page.goto(`/w/${agency.slug}/settings/members`)
  const agencyMenu = await openMenu(
    page,
    page.getByRole("button", { name: `Actions for ${staff.user.fullName}` })
  )
  await expect(agencyMenu.getByRole("menuitem", { name: "Make owner…" })).toBeHidden()
  await expect(agencyMenu.getByRole("menuitem", { name: "Transfer ownership…" })).toBeVisible()
})

test("7. an agency keeps its last owner; a client's last direct owner may go (its agency owns it)", async ({
  page,
}) => {
  test.slow()
  const { owner, ownerId, agency, client } = await agencyWithClient("continuity")
  const sole = await member("soleowner", client.id, "owner")
  await signedIn(page, owner)

  await test.step("the agency owner removes the client's only direct owner", async () => {
    await page.goto(`/w/${client.slug}/settings/members`)
    await openMenu(page, page.getByRole("button", { name: `Actions for ${sole.user.fullName}` }))
    await page.getByRole("menuitem", { name: "Remove from workspace…" }).click()
    const confirm = page.getByRole("alertdialog")
    await confirm.getByRole("button", { name: "Remove member" }).click()
    await expect(confirm).toBeHidden()
    expect(await rolesIn(client.id)).toEqual({})
    // The agency owner still owns it.
    await page.goto(`/w/${client.slug}/settings`)
    await expect(page.getByRole("heading", { name: "General" })).toBeVisible()
  })

  await test.step("the agency's last owner can't leave, and is told to transfer first", async () => {
    await page.goto(`/w/${agency.slug}/settings`)
    const leave = page.getByRole("button", { name: "Leave workspace…" })
    await expect(leave).toBeDisabled()
    await expect(page.getByText(/only owner of .* Transfer ownership/)).toBeVisible()
  })

  await test.step("…nor step down through the API", async () => {
    const api = await signedInClient(owner.email, owner.password)
    const { error } = await api
      .from("workspace_members")
      .update({ role: "admin" })
      .eq("workspace_id", agency.id)
      .eq("user_id", ownerId)
    expect(error?.message).toMatch(/at least one owner/)
    expect((await rolesIn(agency.id))[ownerId]).toBe("owner")
  })
})

test("a member leaves; members can't read the audit log; owners see who left", async ({
  page,
  browser,
}) => {
  test.slow()
  const { owner, agency } = await agencyWithClient("auditowner")
  const leaver = await member("leaver", agency.id, "member")

  const memberPage = await newPage(browser)
  await signedIn(memberPage, leaver.user)
  await memberPage.goto(`/w/${agency.slug}/settings/members`)
  await expect(
    memberPage
      .getByRole("navigation", { name: "Settings" })
      .getByRole("link", { name: "Audit log" })
  ).toBeHidden()
  await memberPage.goto(`/w/${agency.slug}/settings/audit-log`)
  await expect(
    memberPage.getByRole("heading", { name: "Only owners and admins can view the audit log" })
  ).toBeVisible()

  await memberPage.goto(`/w/${agency.slug}/settings`)
  await memberPage.getByRole("button", { name: "Leave workspace…" }).click()
  await memberPage.getByRole("alertdialog").getByRole("button", { name: "Leave workspace" }).click()
  await expect(memberPage).toHaveURL(/\/onboarding$/)
  await memberPage.goto(`/w/${agency.slug}`)
  await expect(memberPage.getByRole("heading", { name: "Workspace not found" })).toBeVisible()
  await memberPage.context().close()

  await signedIn(page, owner)
  await page.goto(`/w/${agency.slug}/settings/audit-log?action=workspace.member_left`)
  await expect(page.getByLabel("Action")).toHaveValue("workspace.member_left")
  const rows = page.getByRole("table").getByRole("row")
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(1)).toContainText(
    `${leaver.user.fullName} left this workspace (was a member).`
  )

  await page.goto(`/w/${agency.slug}/settings/audit-log?from=2020-01-01&to=2020-01-31`)
  await expect(page.getByText("No events match these filters")).toBeVisible()
  await page.goto(`/w/${agency.slug}/settings/audit-log?from=2026-09-24&to=2026-01-01`)
  await expect(page.getByText("The start date is after the end date.")).toBeVisible()
})

test("pending invitations wait on onboarding for a confirmed account; closed ones don't show", async ({
  page,
}) => {
  test.slow()
  const { owner, agency, client } = await agencyWithClient("pendingowner")
  const other = await agencyWithClient("pendingother")
  const invitee = testUser("pendinginvitee")
  await createConfirmedUser({ email: invitee.email, password: invitee.password })

  const invite = async (by: TestUser, workspaceId: string) => {
    const api = await signedInClient(by.email, by.password)
    const tokenHash = createHash("sha256")
      .update(randomBytes(32).toString("base64url"))
      .digest("hex")
    const { data, error } = await api.rpc("create_workspace_invitation", {
      p_workspace_id: workspaceId,
      p_email: invitee.email,
      p_role: "member",
      p_token_hash: tokenHash,
    })
    if (error) throw error
    return data[0].invitation_id as string
  }
  await invite(owner, agency.id)
  const revoked = await invite(owner, client.id)
  const expired = await invite(other.owner, other.agency.id)
  const ownerApi = await signedInClient(owner.email, owner.password)
  await ownerApi.rpc("revoke_workspace_invitation", {
    p_workspace_id: client.id,
    p_invitation_id: revoked,
  })
  await adminClient()!
    .from("workspace_invitations")
    .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
    .eq("id", expired)

  await page.setViewportSize({ width: 375, height: 800 })
  await signedIn(page, invitee)
  await expect(page).toHaveURL(/\/onboarding$/)
  const list = page.getByRole("list", { name: "Pending invitations" })
  await expect(list.getByRole("listitem")).toHaveCount(1)
  await expect(list).toContainText(agency.name)
  await expect(page.getByRole("heading", { name: "Or set up your own workspace" })).toBeVisible()
  await expectNoHorizontalOverflow(page)

  await page.getByLabel("Your name for the team you join").fill(invitee.fullName)
  await page.getByRole("button", { name: `Accept invitation to ${agency.name}` }).click()
  await expect(page).toHaveURL(`/w/${agency.slug}`)
})

test("client search matches business email and phone, not just the name", async ({ page }) => {
  const { owner, agency } = await agencyWithClient("searcher")
  const api = await signedInClient(owner.email, owner.password)
  const { data, error } = await api.rpc("create_client_workspace", {
    p_agency_id: agency.id,
    p_name: `Zeta ${owner.workspaceName}`,
    p_business_name: "Zeta Roofing LLC",
    p_business_email: `office.${owner.workspaceName.replace(/\W/g, "")}@zeta.example`,
    p_business_phone: "+15125550147",
  })
  if (error) throw error
  workspaces.clients.push(data.id)

  await signedIn(page, owner)
  const search = async (text: string) => {
    await page.goto(`/w/${agency.slug}/clients?${new URLSearchParams({ q: text })}`)
    return page.getByRole("link", { name: `Zeta ${owner.workspaceName}`, exact: true })
  }
  await expect(await search("office.")).toBeVisible()
  await expect(await search("(512) 555-0147")).toBeVisible()
  await expect(await search("Roofing LLC")).toBeVisible()
  await expect(await search("a,b).or(x")).toBeHidden()
  await expect(page.getByText(/No clients match/)).toBeVisible()
})

test("members, dialogs, the audit log and settings fit a 375px screen", async ({ browser }) => {
  test.slow()
  const { owner, agency } = await agencyWithClient("narrow")
  const sarah = await member("narrowsarah", agency.id, "member")
  const page = await newPage(browser, { width: 375, height: 812 })
  await signedIn(page, owner)

  await page.goto(`/w/${agency.slug}/settings/members`)
  await expectNoHorizontalOverflow(page)
  await openMenu(page, page.getByRole("button", { name: `Actions for ${sarah.user.fullName}` }))
  await page.getByRole("menuitem", { name: "Transfer ownership…" }).click()
  await expect(page.getByRole("dialog")).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toBeHidden()
  // Focus goes back to the menu button that opened the dialog.
  await expect(
    page.getByRole("button", { name: `Actions for ${sarah.user.fullName}` })
  ).toBeFocused()

  await page.goto(`/w/${agency.slug}/settings/audit-log`)
  await expect(page.getByRole("table")).toBeVisible()
  await expectNoHorizontalOverflow(page)

  await page.goto(`/w/${agency.slug}/settings`)
  await expect(page.getByRole("button", { name: "Leave workspace…" })).toBeDisabled()
  await expectNoHorizontalOverflow(page)
  await page.context().close()
})
