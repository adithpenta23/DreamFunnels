<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# DreamFunnels project rules

Read `docs/ARCHITECTURE.md`, `docs/DATABASE.md` and `docs/QA.md` before changing structure,
schema or tests. The non-negotiables:

- **Tenant isolation**: every tenant-owned table has `workspace_id`, RLS enabled in the same
  migration, least-privilege grants, and RLS tests in `supabase/tests/` (outsider can't
  read/write, anon denied). Use the template in `docs/DATABASE.md`.
- **Authorization is server-side**: call `requireUser()` / `requireWorkspaceMember()` next to
  data access. The proxy is not a security boundary. Use the user-scoped Supabase client
  (`@/lib/supabase/server`). The admin client (`@/lib/supabase/admin`) is only for no-user
  code paths.
- **Mutations** are Server Actions that validate with Zod and return `ActionResult` via
  `runAction`. Throw `AppError` for expected failures.
- **No `console`**: use `logger` from `@/lib/logger` with dot-namespaced event names. Never log
  secrets or PII.
- **Env vars**: add to `src/lib/env/schema.ts`, `.env.example` and (for `NEXT_PUBLIC_*`)
  `src/lib/env/public.ts`.
- **No new dependencies** without a concrete requirement. Note the decision in ARCHITECTURE.md.
- **Done means** `npm run check` and `npm run test:e2e` pass.
