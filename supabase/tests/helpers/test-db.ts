import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { PGlite, type Transaction } from "@electric-sql/pglite"

/**
 * In-process Postgres (PGlite/WASM) with just enough of Supabase's platform
 * schema to run our real migrations and exercise RLS as real roles.
 *
 * What is emulated (mirrors Supabase semantics):
 *   - roles: anon, authenticated, service_role (BYPASSRLS), supabase_auth_admin
 *   - auth.users (subset of columns our migrations touch) and auth.uid()
 *   - Supabase's default privileges on the public schema
 *
 * What is NOT emulated: PostgREST, GoTrue, JWT verification, storage.
 * Anything depending on those belongs in an E2E test against `supabase start`.
 */
const SUPABASE_PLATFORM_SHIM = /* sql */ `
  create role anon nologin noinherit;
  create role authenticated nologin noinherit;
  create role service_role nologin noinherit bypassrls;
  create role supabase_auth_admin nologin noinherit;

  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role, supabase_auth_admin;

  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text unique,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
  );
  grant all on auth.users to supabase_auth_admin;

  -- Same definition as Supabase's auth.uid().
  create function auth.uid() returns uuid language sql stable as $$
    select coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    )::uuid
  $$;
  grant execute on function auth.uid() to anon, authenticated, service_role, supabase_auth_admin;

  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`

const MIGRATIONS_DIR = fileURLToPath(new URL("../../migrations", import.meta.url))

export type Tx = Transaction

export type TestDb = {
  /** Superuser connection. Bypasses RLS; use only for fixtures and assertions. */
  admin: PGlite
  /** Creates a user the way GoTrue does, firing the signup trigger. */
  createUser: (email: string, metadata?: Record<string, unknown>) => Promise<string>
  /** Runs `fn` as an authenticated user (RLS enforced). */
  asUser: <T>(userId: string, fn: (tx: Tx) => Promise<T>) => Promise<T>
  /** Runs `fn` as the anonymous role (RLS enforced). */
  asAnon: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>
  /** Runs `fn` as service_role (the secret key: bypasses RLS). */
  asServiceRole: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>
  /** Applies the migrations held back by `stopBefore` (no-op otherwise). */
  applyRemainingMigrations: () => Promise<void>
  close: () => Promise<void>
}

type TestDbOptions = {
  /**
   * Apply only the migrations whose file name sorts before this one, so a
   * test can create data in the old shape and then check how a new migration
   * treats it (call applyRemainingMigrations()).
   */
  stopBefore?: string
}

export async function createTestDb({ stopBefore }: TestDbOptions = {}): Promise<TestDb> {
  const admin = await PGlite.create()
  await admin.exec(SUPABASE_PLATFORM_SHIM)

  const migrations = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort()
  if (stopBefore && !migrations.includes(stopBefore)) {
    throw new Error(`Unknown migration: ${stopBefore}`)
  }
  const cut = stopBefore ? migrations.indexOf(stopBefore) : migrations.length
  const apply = async (files: string[]) => {
    for (const file of files) {
      await admin.exec(readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"))
    }
  }
  await apply(migrations.slice(0, cut))
  let remaining = migrations.slice(cut)

  const runAs = <T>(
    role: "anon" | "authenticated" | "service_role",
    claims: Record<string, unknown>,
    fn: (tx: Tx) => Promise<T>
  ) =>
    admin.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)])
      await tx.exec(`set local role ${role}`)
      return fn(tx)
    })

  return {
    admin,
    async createUser(email, metadata = {}) {
      return admin.transaction(async (tx) => {
        await tx.exec("set local role supabase_auth_admin")
        const { rows } = await tx.query<{ id: string }>(
          "insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id",
          [email, JSON.stringify(metadata)]
        )
        const row = rows[0]
        if (!row) throw new Error("Failed to create test user")
        return row.id
      })
    },
    asUser: (userId, fn) => runAs("authenticated", { sub: userId, role: "authenticated" }, fn),
    asAnon: (fn) => runAs("anon", { role: "anon" }, fn),
    asServiceRole: (fn) => runAs("service_role", { role: "service_role" }, fn),
    async applyRemainingMigrations() {
      const pending = remaining
      remaining = []
      await apply(pending)
    },
    close: () => admin.close(),
  }
}
