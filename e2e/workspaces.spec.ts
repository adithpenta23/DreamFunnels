import { expect, test, type Page } from "@playwright/test"
import { giveEachTestItsOwnIp } from "./support/client-ip"
import {
  newTestUser,
  openWorkspaceSwitcher,
  signUpAndOnboard,
  type TestUser,
} from "./support/flows"
import { adminClient, deleteUsers, requireSupabase } from "./support/supabase"

/**
 * Sprint 2: the workspace business profile (with time zones) and agency ->
 * client access, through real Auth, PostgREST and RLS.
 */
requireSupabase()
giveEachTestItsOwnIp()

const created: TestUser[] = []
const createdWorkspaceIds: string[] = []
function testUser(label: string) {
  const user = newTestUser(label)
  created.push(user)
  return user
}

test.afterAll(async () => {
  const admin = adminClient()
  if (admin && createdWorkspaceIds.length > 0) {
    await admin.from("workspaces").delete().in("id", createdWorkspaceIds)
  }
  await deleteUsers(created.map((user) => user.email))
})

/** Picks an option in a searchable select by typing, like a keyboard user. */
async function choose(page: Page, label: string, query: string, option: string | RegExp) {
  const input = page.getByRole("combobox", { name: label })
  await input.click()
  await input.fill(query)
  await page.getByRole("option", { name: option }).click()
}

test.describe("with a browser in Denver", () => {
  test.use({ timezoneId: "America/Denver", locale: "en-GB" })

  test("new workspaces and profiles start in the browser's time zone", async ({ page }) => {
    const user = testUser("tzhint")
    const slug = await signUpAndOnboard(page, user)

    await page.goto(`/w/${slug}/settings`)
    await expect(page.getByRole("combobox", { name: "Time zone" })).toHaveValue(
      "Mountain Time — Denver"
    )
    await page.goto(`/w/${slug}/settings/account`)
    await expect(page.getByRole("combobox", { name: "Your time zone" })).toHaveValue(
      "Mountain Time — Denver"
    )
    await expect(page.getByRole("combobox", { name: "Date and number format" })).toHaveValue(
      "English (United Kingdom)"
    )
  })
})

test("owners can fill in the business profile", async ({ page }) => {
  const user = testUser("profile")
  const slug = await signUpAndOnboard(page, user)
  await page.goto(`/w/${slug}/settings`)
  const save = page.getByRole("button", { name: "Save business profile" })

  await test.step("an invalid phone is rejected on its field, keeping the input", async () => {
    await page.getByLabel("Phone", { exact: true }).fill("555-0100")
    await save.click()
    await expect(page.getByText(/Enter a valid phone number/)).toBeVisible()
    await expect(page.getByLabel("Phone", { exact: true })).toHaveValue("555-0100")
  })

  await test.step("a complete profile saves, normalised", async () => {
    await page.getByLabel("Business name").fill("Acme Roofing LLC")
    await page.getByLabel("Email", { exact: true }).fill("Hello@Acme-Roofing.example")
    await page.getByLabel("Phone", { exact: true }).fill("+1 (512) 555-0100")
    await choose(page, "Time zone", "chicago", /^Central Time — Chicago/)
    await page.getByLabel("Street address").fill("100 Congress Ave")
    await page.getByLabel("City", { exact: true }).fill("Austin")
    await page.getByLabel("State, province or region").fill("TX")
    await page.getByLabel("ZIP or postal code").fill("78701")
    await choose(page, "Country", "united st", /^United States/)
    await page.getByLabel("Primary color", { exact: true }).fill("#1D4ED8")
    await save.click()

    await expect(page.getByText("Business profile saved")).toBeVisible()
    await expect(page.getByLabel("Phone", { exact: true })).toHaveValue("+15125550100")
    await expect(page.getByLabel("Email", { exact: true })).toHaveValue(
      "hello@acme-roofing.example"
    )
    await expect(save).toBeDisabled()
  })

  await test.step("it's still there after a reload", async () => {
    await page.reload()
    await expect(page.getByLabel("Business name")).toHaveValue("Acme Roofing LLC")
    await expect(page.getByRole("combobox", { name: "Time zone" })).toHaveValue(
      "Central Time — Chicago"
    )
    await expect(page.getByRole("combobox", { name: "Country" })).toHaveValue("United States")
    await expect(page.getByLabel("Primary color", { exact: true })).toHaveValue("#1d4ed8")
  })
})

test("agency owners reach their clients; nobody else does", async ({ page, browser }) => {
  const admin = adminClient()
  test.skip(!admin, "Needs SUPABASE_SECRET_KEY to provision a client workspace")
  if (!admin) return
  test.slow()

  const agencyOwner = testUser("agency")
  const agencySlug = await signUpAndOnboard(page, agencyOwner)

  // No agency UI yet: provision a client the way the future agency flow will
  // (trusted code), under the owner's agency.
  const { data: agency } = await admin
    .from("workspaces")
    .select("id")
    .eq("slug", agencySlug)
    .single()
  const clientName = `Client of ${agencyOwner.workspaceName}`
  const clientSlug = `${agencySlug}-client`
  const { data: client, error } = await admin
    .from("workspaces")
    .insert({
      name: clientName,
      slug: clientSlug,
      workspace_type: "client",
      parent_workspace_id: agency?.id,
    })
    .select("id")
    .single()
  expect(error).toBeNull()
  if (client) createdWorkspaceIds.push(client.id)

  await test.step("the agency owner opens the client as its owner", async () => {
    await page.goto(`/w/${clientSlug}`)
    await expect(page.getByRole("heading", { level: 1, name: clientName })).toBeVisible()
    await page.goto(`/w/${clientSlug}/settings`)
    await expect(page.getByRole("button", { name: "Save business profile" })).toBeVisible()
    const role = page.getByRole("term").filter({ hasText: "Your role" }).locator("xpath=..")
    await expect(role).toContainText("Owner")

    const menu = await openWorkspaceSwitcher(page, clientName)
    await expect(
      menu.getByRole("menuitem", { name: agencyOwner.workspaceName, exact: true })
    ).toBeVisible()
    await expect(menu.getByRole("menuitem", { name: clientName })).toBeVisible()
  })

  await test.step("an outsider can't see it; an agency member doesn't inherit it", async () => {
    const otherContext = await browser.newContext()
    const otherPage = await otherContext.newPage()
    const colleague = testUser("colleague")
    await signUpAndOnboard(otherPage, colleague)

    for (const path of [`/w/${agencySlug}`, `/w/${clientSlug}`]) {
      await otherPage.goto(path)
      await expect(otherPage.getByRole("heading", { name: "Workspace not found" })).toBeVisible()
    }

    const { data: colleagueProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("email", colleague.email)
      .single()
    // Stands in for an accepted invitation: a plain member of the agency.
    await admin
      .from("workspace_members")
      .insert({ workspace_id: agency?.id, user_id: colleagueProfile?.id, role: "member" })

    await otherPage.goto(`/w/${agencySlug}`)
    await expect(
      otherPage.getByRole("heading", { level: 1, name: agencyOwner.workspaceName })
    ).toBeVisible()
    await otherPage.goto(`/w/${clientSlug}`)
    await expect(otherPage.getByRole("heading", { name: "Workspace not found" })).toBeVisible()
    await expect(otherPage.getByText(clientName)).toHaveCount(0)
    await otherContext.close()
  })
})
