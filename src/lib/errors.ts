/**
 * Application error model. Throw `AppError` for failures the app understands;
 * anything else is treated as an unexpected INTERNAL error. Only messages
 * marked `expose` ever reach users — everything else gets a generic message
 * so internals (SQL, stack traces, provider errors) never leak.
 */

export const ERROR_CODES = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION",
  "CONFLICT",
  "RATE_LIMITED",
  "INTERNAL",
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

export const HTTP_STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
}

const DEFAULT_PUBLIC_MESSAGES: Record<ErrorCode, string> = {
  UNAUTHENTICATED: "Please sign in to continue.",
  FORBIDDEN: "You don't have permission to do that.",
  NOT_FOUND: "We couldn't find what you were looking for.",
  VALIDATION: "Please check the highlighted fields and try again.",
  CONFLICT: "That conflicts with existing data. Please refresh and try again.",
  RATE_LIMITED: "Too many attempts. Please wait a moment and try again.",
  INTERNAL: "Something went wrong on our side. Please try again.",
}

/** Per-field messages for forms, keyed by input name. Always user-facing. */
export type FieldErrors = Partial<Record<string, string[]>>

type AppErrorOptions = {
  cause?: unknown
  /** The message is safe to show to end users. Defaults to false. */
  expose?: boolean
  /** Structured, non-sensitive details for logs. */
  context?: Record<string, unknown>
  /**
   * Messages to show next to specific form fields (e.g. "That URL is taken").
   * They reach users regardless of `expose`, so write them for users.
   */
  fieldErrors?: FieldErrors
}

export class AppError extends Error {
  override readonly name = "AppError"
  readonly code: ErrorCode
  readonly status: number
  readonly expose: boolean
  readonly context: Record<string, unknown> | undefined
  readonly fieldErrors: FieldErrors | undefined

  constructor(code: ErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, { cause: options.cause })
    this.code = code
    this.status = HTTP_STATUS[code]
    this.expose = options.expose ?? false
    this.context = options.context
    this.fieldErrors = options.fieldErrors
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}

export type PublicError = { code: ErrorCode; message: string }

/** Converts any thrown value into something safe to return to a client. */
export function toPublicError(error: unknown): PublicError {
  if (isAppError(error)) {
    return {
      code: error.code,
      message: error.expose ? error.message : DEFAULT_PUBLIC_MESSAGES[error.code],
    }
  }
  return { code: "INTERNAL", message: DEFAULT_PUBLIC_MESSAGES.INTERNAL }
}

export function publicMessageFor(code: ErrorCode): string {
  return DEFAULT_PUBLIC_MESSAGES[code]
}
