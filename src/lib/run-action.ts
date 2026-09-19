import "server-only"

import { unstable_rethrow } from "next/navigation"
import { fail, ok, type ActionResult } from "@/lib/action-result"
import { isAppError, toPublicError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { reportError } from "@/lib/monitoring"

/**
 * Wraps a Server Action body with consistent error handling:
 * - Next.js control-flow errors (redirect, notFound) pass through untouched.
 * - `AppError`s become typed failures (logged at warn, or reported if INTERNAL),
 *   keeping any per-field messages for the form.
 * - Anything else is reported and returned as a generic INTERNAL failure.
 *
 * Validation and authorization still belong inside `fn` (see docs/ARCHITECTURE.md).
 */
export async function runAction<T>(name: string, fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return ok(await fn())
  } catch (error) {
    unstable_rethrow(error)

    if (isAppError(error) && error.code !== "INTERNAL") {
      logger.warn("action.failed", { action: name, code: error.code, ...error.context })
    } else {
      reportError(error, { action: name })
    }
    const { code, message } = toPublicError(error)
    return fail(code, message, isAppError(error) ? error.fieldErrors : undefined)
  }
}
