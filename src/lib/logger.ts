/**
 * Minimal structured logger (isomorphic, dependency-free).
 *
 * - Production: one JSON object per line on stdout/stderr, which Vercel and
 *   most log drains ingest as structured data.
 * - Development: human-readable lines.
 * - Test: silent unless LOG_LEVEL is set.
 *
 * Conventions: the message is a dot-namespaced event name
 * (`auth.sign_in_link_sent`), details go in the context object, and values
 * under sensitive-looking keys are redacted automatically. Never log raw
 * request bodies, tokens or email contents.
 */

export type LogLevel = "debug" | "info" | "warn" | "error"
export type LogThreshold = LogLevel | "silent"
export type LogContext = Record<string, unknown>

export type Logger = {
  debug: (event: string, context?: LogContext) => void
  info: (event: string, context?: LogContext) => void
  warn: (event: string, context?: LogContext) => void
  error: (event: string, context?: LogContext) => void
  child: (bindings: LogContext) => Logger
}

export type LogRecord = { level: LogLevel; time: string; event: string } & LogContext

type LoggerOptions = {
  level?: LogThreshold
  format?: "json" | "pretty"
  bindings?: LogContext
  /** Where records go. Defaults to the console; tests inject a collector. */
  sink?: (record: LogRecord, line: string) => void
}

const SEVERITY: Record<LogThreshold, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: Infinity,
}

const SENSITIVE_KEY =
  /pass(word)?|secret|token|authorization|cookie|api[-_]?key|private[-_]?key|service[-_]?role|credential/i
const REDACTED = "[REDACTED]"
const MAX_DEPTH = 6

export function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "[Truncated]"
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      ...(value.stack ? { stack: value.stack } : {}),
      ...("code" in value ? { code: redact(value.code, depth + 1) } : {}),
      ...("digest" in value ? { digest: redact(value.digest, depth + 1) } : {}),
      // AppError carries structured, non-sensitive diagnostics.
      ...("context" in value && value.context ? { context: redact(value.context, depth + 1) } : {}),
      ...(value.cause !== undefined ? { cause: redact(value.cause, depth + 1) } : {}),
    }
  }
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1))
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        SENSITIVE_KEY.test(key) ? REDACTED : redact(entry, depth + 1),
      ])
    )
  }
  return value
}

function defaultSink(record: LogRecord, line: string) {
  if (record.level === "error") console.error(line)
  else if (record.level === "warn") console.warn(line)
  else console.log(line)
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const threshold = SEVERITY[options.level ?? "info"]
  const format = options.format ?? "json"
  const bindings = options.bindings ?? {}
  const sink = options.sink ?? defaultSink

  const write = (level: LogLevel, event: string, context?: LogContext) => {
    if (SEVERITY[level] < threshold) return
    const details = redact({ ...bindings, ...context }) as LogContext
    const time = new Date().toISOString()
    // Fixed fields last so context can never overwrite them.
    const record: LogRecord = { ...details, level, time, event }
    const line =
      format === "json"
        ? JSON.stringify(record)
        : `${time} ${level.toUpperCase().padEnd(5)} ${event}` +
          (Object.keys(details).length > 0 ? ` ${JSON.stringify(details)}` : "")
    sink(record, line)
  }

  return {
    debug: (event, context) => write("debug", event, context),
    info: (event, context) => write("info", event, context),
    warn: (event, context) => write("warn", event, context),
    error: (event, context) => write("error", event, context),
    child: (childBindings) =>
      createLogger({ ...options, bindings: { ...bindings, ...childBindings } }),
  }
}

function resolveThreshold(): LogThreshold {
  const configured = process.env.LOG_LEVEL
  if (configured && configured in SEVERITY) return configured as LogThreshold
  if (process.env.NODE_ENV === "test") return "silent"
  return process.env.NODE_ENV === "production" ? "info" : "debug"
}

export const logger = createLogger({
  level: resolveThreshold(),
  format: process.env.NODE_ENV === "production" ? "json" : "pretty",
})
