import { createHash, randomBytes } from "node:crypto"
import { expect, test } from "@playwright/test"
import type { SupabaseClient } from "@supabase/supabase-js"
import { newTestUser, type TestUser } from "./support/flows"
import {
  addMembership,
  adminClient,
  createConfirmedUser,
  deleteUsers,
  deleteWorkspaces,
  requireSupabase,
  signedInClient,
} from "./support/supabase"

/**
 * Sprint 3 concurrency, against the real local Postgres through PostgREST:
 * requests fired at the same moment must leave consistent state. PGlite (the
 * RLS suite) runs one connection, so these races can only be tested here.
 * No browser: each "user" is a signed-in supabase-js client, like the app.
 */
requireSupabase()
test.skip(!adminClient(), "Needs SUPABASE_SECRET_KEY for fixtures and cleanup")

const users: TestUser[] = []
const workspaces = { clients: [] as string[], agencies: [] as string[] }

test.afterAll(async () => {
  await deleteWorkspaces(workspaces)
  await deleteUsers(users.map((user) => user.email))
})

type Actor = { user: TestUser; id: string; api: SupabaseClient }

async function actor(label: string): Promise<Actor> {
  const user = newTestUser(label)
  users.push(user)
  const id = await createConfirmedUser({ ...user })
  return { user, id, api: await signedInClient(user.email, user.password) }
}

async function agencyOf(owner: Actor): Promise<string> {
  const { data, error } = await owner.api.rpc("create_workspace", {
    p_name: `${owner.user.workspaceName} Agency`,
  })
  if (error) throw error
  workspaces.agencies.push(data.id)
  return data.id as string
}

const tokenHash = () =>
  createHash("sha256").update(randomBytes(32).toString("base64url")).digest("hex")

async function rolesIn(workspaceId: string): Promise<Record<string, string>> {
  const { data } = await adminClient()!
    .from("workspace_members")
    .select("user_id, role")
    .eq("workspace_id", workspaceId)
  return Object.fromEntries((data ?? []).map((row) => [row.user_id, row.role]))
}

test("13. accepting one invitation many times at once creates one membership", async () => {
  const owner = await actor("raceowner")
  const invitee = await actor("raceinvitee")
  const agencyId = await agencyOf(owner)
  const hash = tokenHash()
  const created = await owner.api.rpc("create_workspace_invitation", {
    p_workspace_id: agencyId,
    p_email: invitee.user.email,
    p_role: "member",
    p_token_hash: hash,
  })
  expect(created.data?.[0]?.outcome).toBe("created")

  const results = await Promise.all(
    Array.from({ length: 8 }, () =>
      invitee.api.rpc("accept_workspace_invitation", { p_token_hash: hash })
    )
  )
  for (const result of results) {
    expect(result.error).toBeNull()
    // The first one joins; the rest find it already accepted by the same person.
    expect(result.data?.[0]?.outcome).toBe("accepted")
  }
  const { data } = await adminClient()!
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", agencyId)
    .eq("user_id", invitee.id)
  expect(data).toHaveLength(1)
})

test("inviting the same address many times at once leaves one invitation", async () => {
  const owner = await actor("inviterace")
  const agencyId = await agencyOf(owner)
  const email = newTestUser("doubleclick").email

  const results = await Promise.all(
    Array.from({ length: 6 }, (_, index) =>
      owner.api.rpc("create_workspace_invitation", {
        p_workspace_id: agencyId,
        // Different spellings of one address count as one.
        p_email: index % 2 ? email.toUpperCase() : ` ${email}`,
        p_role: "member",
        p_token_hash: tokenHash(),
      })
    )
  )
  const outcomes = results.map((result) => result.data?.[0]?.outcome).sort()
  expect(outcomes.filter((outcome) => outcome === "created")).toHaveLength(1)
  expect(outcomes.filter((outcome) => outcome === "already_pending")).toHaveLength(5)

  const { data } = await adminClient()!
    .from("workspace_invitations")
    .select("id")
    .eq("workspace_id", agencyId)
    .eq("email", email)
  expect(data).toHaveLength(1)
})

test("two owners demoting each other at once can't leave a workspace ownerless", async () => {
  const first = await actor("ownerone")
  const second = await actor("ownertwo")
  const agencyId = await agencyOf(first)
  await addMembership(agencyId, second.id, "owner")

  for (let round = 0; round < 3; round++) {
    const demote = (by: Actor, target: Actor) =>
      by.api
        .from("workspace_members")
        .update({ role: "admin" })
        .eq("workspace_id", agencyId)
        .eq("user_id", target.id)
        .select("user_id")
    const [a, b] = await Promise.all([demote(first, second), demote(second, first)])

    // At most one demotion lands; the other is refused (last owner) or finds
    // its author no longer an owner (0 rows).
    const landed = [a, b].filter((result) => (result.data?.length ?? 0) > 0)
    expect(landed.length).toBeLessThanOrEqual(1)
    for (const result of [a, b]) {
      if (result.error) expect(result.error.message).toMatch(/at least one owner/)
    }
    const roles = await rolesIn(agencyId)
    expect(Object.values(roles)).toContain("owner")

    // Reset for the next round.
    await adminClient()!
      .from("workspace_members")
      .update({ role: "owner" })
      .eq("workspace_id", agencyId)
      .in("user_id", [first.id, second.id])
  }
})

test("removing a member while another admin changes their role stays consistent", async () => {
  const owner = await actor("removeowner")
  const admin = await actor("roleadmin")
  const member = await actor("targetmember")
  const agencyId = await agencyOf(owner)
  await addMembership(agencyId, admin.id, "admin")
  await addMembership(agencyId, member.id, "member")

  const [removed, changed] = await Promise.all([
    owner.api
      .from("workspace_members")
      .delete()
      .eq("workspace_id", agencyId)
      .eq("user_id", member.id)
      .select("user_id"),
    admin.api
      .from("workspace_members")
      .update({ role: "admin" })
      .eq("workspace_id", agencyId)
      .eq("user_id", member.id)
      .select("user_id"),
  ])
  expect(removed.error).toBeNull()
  expect(changed.error).toBeNull()
  expect(removed.data).toHaveLength(1)
  // Whichever ran first, the member is gone in the end and nothing half-applied.
  const roles = await rolesIn(agencyId)
  expect(roles[member.id]).toBeUndefined()
  expect(roles[owner.id]).toBe("owner")
})

test("clients created at once get distinct URLs; duplicate names are refused", async () => {
  const owner = await actor("clientrace")
  const agencyId = await agencyOf(owner)
  const create = (name: string) =>
    owner.api.rpc("create_client_workspace", { p_agency_id: agencyId, p_name: name })

  const suffix = owner.user.workspaceName.split(" ")[1]
  const similar = await Promise.all([
    create(`Joe & Sons ${suffix}`),
    create(`Joe + Sons ${suffix}`),
    create(`Joe / Sons ${suffix}`),
  ])
  const slugs = similar.map((result) => {
    expect(result.error).toBeNull()
    workspaces.clients.push(result.data!.id as string)
    return result.data!.slug as string
  })
  expect(new Set(slugs).size).toBe(3)

  const same = await Promise.all([create(`Same Name ${suffix}`), create(`same name ${suffix}`)])
  const succeeded = same.filter((result) => !result.error)
  for (const result of succeeded) workspaces.clients.push(result.data!.id as string)
  expect(succeeded).toHaveLength(1)
  expect(same.find((result) => result.error)?.error?.message).toMatch(/workspaces_client_name_key/)
})
