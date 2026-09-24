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
 * Sprint 4 ownership under concurrency, against the real local Postgres
 * through PostgREST (PGlite runs one connection, so races live here). Each
 * "user" is a signed-in supabase-js client, like the app. Whatever wins, the
 * workspace must always have an owner and nobody may end up owner by a lost
 * race.
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

async function rolesIn(workspaceId: string): Promise<Record<string, string>> {
  const { data } = await adminClient()!
    .from("workspace_members")
    .select("user_id, role")
    .eq("workspace_id", workspaceId)
  return Object.fromEntries((data ?? []).map((row) => [row.user_id, row.role]))
}

async function setRoles(workspaceId: string, roles: Record<string, string>) {
  for (const [userId, role] of Object.entries(roles)) {
    const { data } = await adminClient()!
      .from("workspace_members")
      .update({ role })
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .select("user_id")
    if (!data?.length) await addMembership(workspaceId, userId, role)
  }
}

const transfer = (by: Actor, workspaceId: string, to: Actor) =>
  by.api.rpc("transfer_workspace_ownership", {
    p_workspace_id: workspaceId,
    p_new_owner_id: to.id,
  })

test("two transfers by one owner at once: exactly one lands", async () => {
  const owner = await actor("twotransfers")
  const first = await actor("heirone")
  const second = await actor("heirtwo")
  const agencyId = await agencyOf(owner)

  for (let round = 0; round < 3; round++) {
    await setRoles(agencyId, { [owner.id]: "owner", [first.id]: "member", [second.id]: "member" })
    const results = await Promise.all([
      transfer(owner, agencyId, first),
      transfer(owner, agencyId, second),
    ])

    const landed = results.filter((result) => result.data === "transferred")
    expect(landed).toHaveLength(1)
    const refused = results.find((result) => result.data !== "transferred")
    expect(refused?.error?.code).toBe("42501")

    const roles = await rolesIn(agencyId)
    expect(roles[owner.id]).toBe("admin")
    expect([roles[first.id], roles[second.id]].sort()).toEqual(["member", "owner"])
  }
})

test("a transfer racing the target's removal stays consistent", async () => {
  const owner = await actor("raceowner")
  const coOwner = await actor("racecoowner")
  const target = await actor("racetarget")
  const agencyId = await agencyOf(owner)

  for (let round = 0; round < 3; round++) {
    await setRoles(agencyId, { [owner.id]: "owner", [coOwner.id]: "owner", [target.id]: "member" })
    const [transferred, removed] = await Promise.all([
      transfer(owner, agencyId, target),
      coOwner.api
        .from("workspace_members")
        .delete()
        .eq("workspace_id", agencyId)
        .eq("user_id", target.id)
        .select("user_id"),
    ])

    const roles = await rolesIn(agencyId)
    expect(Object.values(roles)).toContain("owner")
    if (transferred.data === "transferred") {
      // Transfer first: the owner stepped down; the target is an owner, unless
      // the co-owner then removed them (allowed: other owners remain).
      expect(roles[owner.id]).toBe("admin")
      expect(roles[target.id] === "owner" || (removed.data?.length ?? 0) === 1).toBe(true)
    } else {
      // Removal first: nothing to transfer to; the owner is still the owner.
      expect(transferred.data).toBe("not_member")
      expect(roles[owner.id]).toBe("owner")
      expect(roles[target.id]).toBeUndefined()
    }
  }
})

test("a transfer racing the owner's own demotion never leaves the workspace ownerless", async () => {
  const owner = await actor("demoteowner")
  const coOwner = await actor("demotecoowner")
  const target = await actor("demotetarget")
  const agencyId = await agencyOf(owner)

  for (let round = 0; round < 3; round++) {
    await setRoles(agencyId, { [owner.id]: "owner", [coOwner.id]: "owner", [target.id]: "member" })
    const [transferred] = await Promise.all([
      transfer(owner, agencyId, target),
      coOwner.api
        .from("workspace_members")
        .update({ role: "admin" })
        .eq("workspace_id", agencyId)
        .eq("user_id", owner.id)
        .select("user_id"),
    ])

    const roles = await rolesIn(agencyId)
    expect(Object.values(roles)).toContain("owner")
    expect(roles[owner.id]).toBe("admin")
    // The target only became an owner if the transfer won (a demoted caller is refused).
    if (transferred.data === "transferred") expect(roles[target.id]).toBe("owner")
    else {
      expect(transferred.error?.code).toBe("42501")
      expect(roles[target.id]).toBe("member")
    }
  }
})
