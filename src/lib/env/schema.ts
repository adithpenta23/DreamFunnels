import { z } from "zod"

/**
 * Environment contract. Pure (no `server-only`, no side effects) so it can be
 * used by next.config.ts at build time, by tests, and by the runtime modules
 * in ./public.ts and ./server.ts.
 *
 * Adding a variable: add it here, to .env.example, and (for NEXT_PUBLIC_*) to
 * the literal object in ./public.ts so Next can inline it into the bundle.
 */

export const LOG_LEVELS = ["debug", "info", "warn", "error", "silent"] as const

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_SENTRY_DSN: z.url().optional(),
  NEXT_PUBLIC_POSTHOG_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_POSTHOG_HOST: z.url().optional(),
})

export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(LOG_LEVELS).optional(),
  /** Bypasses RLS. Only for trusted server code (webhooks, jobs). */
  SUPABASE_SECRET_KEY: z.string().min(1).optional(),
  SENTRY_AUTH_TOKEN: z.string().min(1).optional(),
})

export type PublicEnv = z.infer<typeof publicEnvSchema>
export type ServerEnv = z.infer<typeof serverEnvSchema>

type RawEnv = Record<string, string | undefined>

export class EnvValidationError extends Error {
  override readonly name = "EnvValidationError"
  constructor(
    readonly scope: string,
    readonly issues: readonly string[]
  ) {
    super(
      `Invalid ${scope} environment variables:\n${issues.map((issue) => `  - ${issue}`).join("\n")}\n` +
        "Copy .env.example to .env.local and fill in the missing values."
    )
  }
}

function parseEnv<T extends z.ZodType>(schema: T, raw: RawEnv, scope: string): z.infer<T> {
  // `KEY=` in a .env file yields "", which should mean "not set".
  const cleaned = Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== ""))
  const result = schema.safeParse(cleaned)
  if (!result.success) {
    // Report key names and reasons only, never values: they may be secrets.
    const issues = result.error.issues.map(
      (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`
    )
    throw new EnvValidationError(scope, issues)
  }
  return result.data
}

export const parsePublicEnv = (raw: RawEnv): PublicEnv => parseEnv(publicEnvSchema, raw, "public")

export const parseServerEnv = (raw: RawEnv): ServerEnv => parseEnv(serverEnvSchema, raw, "server")
