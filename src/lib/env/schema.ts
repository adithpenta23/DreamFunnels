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

/**
 * Where this deployment runs. `local` covers development, tests and CI (a
 * local Supabase stack); `staging` and `production` are hosted and must be
 * fully configured (see parseDeploymentEnv).
 */
export const APP_ENVS = ["local", "staging", "production"] as const
export type AppEnv = (typeof APP_ENVS)[number]

export const isHostedEnv = (appEnv: AppEnv): boolean => appEnv !== "local"

/**
 * Cloudflare's documented Turnstile test keys ("1x0000…AA" always passes,
 * "2x…" always fails, "3x…" forces a challenge). Fine for staging, never for
 * production, where they would let every bot through.
 */
const TURNSTILE_TEST_KEY = /^[123]x0{10,}/

/**
 * Transactional email transports. `mailpit` is the local stack's mail catcher
 * (development, tests, CI); `resend` sends for real and is required when hosted.
 */
export const EMAIL_PROVIDERS = ["mailpit", "resend"] as const
export type EmailProviderName = (typeof EMAIL_PROVIDERS)[number]

/** Resend's shared onboarding domain only delivers to the account's own address. */
const RESEND_TEST_SENDER = /@resend\.dev$/i

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  /** Cloudflare Turnstile site key. Unset (local only) disables the CAPTCHA. */
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.url().optional(),
  NEXT_PUBLIC_POSTHOG_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_POSTHOG_HOST: z.url().optional(),
})

export const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_ENV: z.enum(APP_ENVS).default("local"),
    /** Set by Vercel on every deployment (build and runtime). */
    VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),
    LOG_LEVEL: z.enum(LOG_LEVELS).optional(),
    /**
     * Bypasses RLS. Only for trusted server code with no user in the loop
     * (webhooks, jobs, the auth rate limiter). Required when hosted.
     */
    SUPABASE_SECRET_KEY: z.string().min(1).optional(),
    /** Cloudflare Turnstile secret. Required when hosted; unset locally disables the CAPTCHA. */
    TURNSTILE_SECRET_KEY: z.string().min(1).optional(),
    SENTRY_AUTH_TOKEN: z.string().min(1).optional(),
    /** How transactional email is sent. Defaults to `mailpit` locally; must be `resend` when hosted. */
    EMAIL_PROVIDER: z.enum(EMAIL_PROVIDERS).optional(),
    /** Sender address (on a domain verified with the provider). Required when hosted. */
    EMAIL_FROM_ADDRESS: z.email().max(254).optional(),
    /** Sender display name. Defaults to the product name. */
    EMAIL_FROM_NAME: z
      .string()
      .max(80)
      .regex(/^[^\r\n<>"]+$/, { error: "Must not contain line breaks, quotes or angle brackets." })
      .optional(),
    /** Resend API key (re_…), sending access only. Required with EMAIL_PROVIDER=resend. */
    RESEND_API_KEY: z.string().min(1).optional(),
    /** Mailpit's web/API address. Defaults to the local stack's (http://127.0.0.1:54324). */
    MAILPIT_URL: z.url().optional(),
  })
  .superRefine((env, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message })

    if (
      (env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview") &&
      env.APP_ENV === "local"
    ) {
      issue(
        "APP_ENV",
        `Set it to "staging" or "production" for Vercel ${env.VERCEL_ENV} deployments.`
      )
    }
    if (env.EMAIL_PROVIDER === "resend") {
      if (!env.RESEND_API_KEY) issue("RESEND_API_KEY", "Required when EMAIL_PROVIDER=resend.")
      if (!env.EMAIL_FROM_ADDRESS) {
        issue("EMAIL_FROM_ADDRESS", "Required when EMAIL_PROVIDER=resend.")
      }
    }
    if (!isHostedEnv(env.APP_ENV)) return

    if (env.EMAIL_PROVIDER !== "resend") {
      issue(
        "EMAIL_PROVIDER",
        `Set it to "resend" when APP_ENV=${env.APP_ENV} (Mailpit only catches mail locally).`
      )
    }
    if (
      env.APP_ENV === "production" &&
      env.EMAIL_FROM_ADDRESS &&
      RESEND_TEST_SENDER.test(env.EMAIL_FROM_ADDRESS)
    ) {
      issue(
        "EMAIL_FROM_ADDRESS",
        "resend.dev only delivers to your own account; use an address on your verified domain."
      )
    }

    if (!env.SUPABASE_SECRET_KEY) {
      issue("SUPABASE_SECRET_KEY", `Required when APP_ENV=${env.APP_ENV} (auth rate limiting).`)
    }
    if (!env.TURNSTILE_SECRET_KEY) {
      issue("TURNSTILE_SECRET_KEY", `Required when APP_ENV=${env.APP_ENV} (sign-up CAPTCHA).`)
    } else if (env.APP_ENV === "production" && TURNSTILE_TEST_KEY.test(env.TURNSTILE_SECRET_KEY)) {
      issue("TURNSTILE_SECRET_KEY", "Cloudflare's test secret can't be used in production.")
    }
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

// `KEY=` in a .env file yields "", which should mean "not set".
const withoutEmpty = (raw: RawEnv) =>
  Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== ""))

// Report key names and reasons only, never values: they may be secrets.
const describeIssues = (error: z.ZodError) =>
  error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)

function parseEnv<T extends z.ZodType>(schema: T, raw: RawEnv, scope: string): z.infer<T> {
  const result = schema.safeParse(withoutEmpty(raw))
  if (!result.success) throw new EnvValidationError(scope, describeIssues(result.error))
  return result.data
}

export const parsePublicEnv = (raw: RawEnv): PublicEnv => parseEnv(publicEnvSchema, raw, "public")

export const parseServerEnv = (raw: RawEnv): ServerEnv => parseEnv(serverEnvSchema, raw, "server")

const isLoopback = (url: string) => /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(new URL(url).host)

/**
 * The whole deployment's configuration, including rules that span the public
 * and server halves. next.config.ts runs it at build and dev start, so a
 * staging or production deploy with a missing or unsafe value fails the build
 * instead of running half-protected.
 */
export function parseDeploymentEnv(raw: RawEnv): { public: PublicEnv; server: ServerEnv } {
  const issues: string[] = []
  const collect = <T>(parse: () => T): T | undefined => {
    try {
      return parse()
    } catch (error) {
      if (!(error instanceof EnvValidationError)) throw error
      issues.push(...error.issues)
      return undefined
    }
  }
  const publicEnv = collect(() => parsePublicEnv(raw))
  const serverEnv = collect(() => parseServerEnv(raw))

  // Cross-checks read the raw values, so they still run (and every problem is
  // listed at once) when one half failed to parse.
  const cleaned = withoutEmpty(raw)
  const appEnv = APP_ENVS.find((env) => env === cleaned.APP_ENV) ?? "local"
  const siteKey = cleaned.NEXT_PUBLIC_TURNSTILE_SITE_KEY

  if (Boolean(siteKey) !== Boolean(cleaned.TURNSTILE_SECRET_KEY)) {
    issues.push(
      "NEXT_PUBLIC_TURNSTILE_SITE_KEY: Set both Turnstile keys (site key and TURNSTILE_SECRET_KEY) or neither."
    )
  }
  if (isHostedEnv(appEnv)) {
    if (!siteKey) {
      issues.push(`NEXT_PUBLIC_TURNSTILE_SITE_KEY: Required when APP_ENV=${appEnv}.`)
    } else if (appEnv === "production" && TURNSTILE_TEST_KEY.test(siteKey)) {
      issues.push(
        "NEXT_PUBLIC_TURNSTILE_SITE_KEY: Cloudflare's test site key can't be used in production."
      )
    }
    if (publicEnv) {
      for (const key of ["NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_SUPABASE_URL"] as const) {
        if (!publicEnv[key].startsWith("https://")) {
          issues.push(`${key}: Must use https when APP_ENV=${appEnv}.`)
        } else if (isLoopback(publicEnv[key])) {
          issues.push(`${key}: Must not point at this machine when APP_ENV=${appEnv}.`)
        }
      }
    }
  }

  if (issues.length > 0 || !publicEnv || !serverEnv) {
    throw new EnvValidationError("deployment", issues)
  }
  return { public: publicEnv, server: serverEnv }
}
