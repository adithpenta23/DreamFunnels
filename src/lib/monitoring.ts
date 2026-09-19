import { logger } from "@/lib/logger"

/**
 * Error-reporting seam (Sentry-ready).
 *
 * All unexpected errors flow through `reportError` — from server actions,
 * route handlers, `instrumentation.ts#onRequestError` and client error
 * boundaries. Today it logs; to add Sentry, install `@sentry/nextjs` and call
 * `setErrorReporter({ captureException: Sentry.captureException })` from
 * `instrumentation.ts` / `instrumentation-client.ts`. See docs/ARCHITECTURE.md.
 */

export type ErrorContext = Record<string, unknown>

export type ErrorReporter = {
  captureException: (error: unknown, context?: ErrorContext) => void
}

let reporter: ErrorReporter | null = null

export function setErrorReporter(next: ErrorReporter | null) {
  reporter = next
}

export function reportError(error: unknown, context: ErrorContext = {}) {
  logger.error("error.unhandled", { ...context, error })
  try {
    reporter?.captureException(error, context)
  } catch (reporterError) {
    // Monitoring must never take the app down with it.
    logger.warn("monitoring.report_failed", { error: reporterError })
  }
}
