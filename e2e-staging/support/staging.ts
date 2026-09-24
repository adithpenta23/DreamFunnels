import { randomBytes } from "node:crypto"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

/**
 * Test data on the STAGING Supabase project, through its admin API (secret
 * key from the GitHub Environment "staging"). Only ever touches what this run
 * created: users are recorded when made and deleted by id, and every delete
 * double-checks the e2e-staging address first.
 *
 * Addresses are Resend's delivery test inbox with a label
 * (delivered+e2e-staging-<label>-<random>@resend.dev): real emails are sent
 * (confirmation, invitation) and "delivered", without bouncing anywhere or
 * hurting the sending domain's reputation. Nobody can read that inbox, so
 * confirmation links come from the admin API instead.
 */

const TEST_ADDRESS = /^delivered\+e2e-staging-[a-z0-9-]+@resend\.dev$/

let admin: SupabaseClient | undefined

export function stagingAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secret = process.env.SUPABASE_SECRET_KEY
  if (!url || !secret)
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required")
  admin ??= createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } })
  return admin
}

export type StagingUser = { email: string; password: string; fullName: string; id?: string }

const created = { users: [] as StagingUser[], workspaces: [] as string[] }

export function stagingUser(label: string): StagingUser {
  const id = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`
  const user = {
    email: `delivered+e2e-staging-${label}-${id}@resend.dev`,
    password: `staging smoke ${randomBytes(12).toString("base64url")}`,
    fullName: `Staging ${label[0]?.toUpperCase() ?? ""}${label.slice(1)}`,
  }
  created.users.push(user)
  return user
}

/** A confirmed account made through the admin API (for people the journey only needs to exist). */
export async function createConfirmedStagingUser(user: StagingUser): Promise<string> {
  const { data, error } = await stagingAdmin().auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true,
    user_metadata: { full_name: user.fullName },
  })
  if (error) throw error
  user.id = data.user.id
  return data.user.id
}

/**
 * The confirmation link for an account that signed up through the UI, in the
 * token_hash form the email template uses (as a path on the app). Generating
 * it replaces the token in the email that was really sent.
 */
export async function confirmationPath(user: StagingUser): Promise<string> {
  const { data, error } = await stagingAdmin().auth.admin.generateLink({
    type: "signup",
    email: user.email,
    password: user.password,
  })
  if (error) throw error
  user.id = data.user.id
  const params = new URLSearchParams({
    token_hash: data.properties.hashed_token,
    type: "signup",
    next: "/dashboard",
  })
  return `/auth/callback?${params}`
}

export function recordWorkspace(id: string) {
  created.workspaces.push(id)
}

/** How the app recorded the invitation email to `email` in `workspaceId`. */
export async function invitationDelivery(
  workspaceId: string,
  email: string
): Promise<string | null> {
  const { data, error } = await stagingAdmin()
    .from("workspace_invitations")
    .select("delivery_status")
    .eq("workspace_id", workspaceId)
    .eq("email", email.toLowerCase())
    .maybeSingle()
  if (error) throw error
  return (data?.delivery_status as string | undefined) ?? null
}

/** Deletes this run's workspaces (clients before agencies) and users, and nothing else. */
export async function cleanUpStagingRun(): Promise<void> {
  const client = stagingAdmin()
  if (created.workspaces.length > 0) {
    const { data } = await client
      .from("workspaces")
      .select("id, workspace_type")
      .in("id", created.workspaces)
    const rows = (data ?? []) as { id: string; workspace_type: string }[]
    for (const type of ["client", "agency"]) {
      const ids = rows.filter((row) => row.workspace_type === type).map((row) => row.id)
      if (ids.length > 0) await client.from("workspaces").delete().in("id", ids)
    }
  }
  const unresolved = created.users.filter((user) => !user.id)
  if (unresolved.length > 0) {
    // Signed up through the UI but failed before we learnt the id.
    const { data } = await client.auth.admin.listUsers({ perPage: 1000 })
    for (const user of unresolved) {
      user.id = data?.users.find((candidate) => candidate.email === user.email)?.id
    }
  }
  for (const user of created.users) {
    if (!TEST_ADDRESS.test(user.email)) {
      throw new Error(`Refusing to delete a non-test address: ${user.email}`)
    }
    if (user.id) await client.auth.admin.deleteUser(user.id)
  }
}

/** The id of a workspace by its URL slug (to record what the UI created). */
export async function workspaceIdBySlug(slug: string): Promise<string> {
  const { data, error } = await stagingAdmin()
    .from("workspaces")
    .select("id")
    .eq("slug", slug)
    .single()
  if (error) throw error
  return data.id as string
}
