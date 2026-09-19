import { z } from "zod"
import { publicMessageFor, type ErrorCode, type FieldErrors } from "@/lib/errors"

/**
 * The return type of every Server Action. Actions never throw expected
 * failures at the client; they return `{ ok: false, error }` so forms can
 * render field errors without an error boundary. Safe to import from Client
 * Components (types + pure helpers only).
 */

export type { FieldErrors }

export type ActionError = {
  code: ErrorCode
  message: string
  fieldErrors?: FieldErrors
}

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: ActionError }

export function ok<T>(data: T): ActionResult<T>
export function ok(): ActionResult<void>
export function ok<T>(data?: T): ActionResult<T | undefined> {
  return { ok: true, data }
}

export type ActionFailure = Extract<ActionResult<never>, { ok: false }>

export function fail(code: ErrorCode, message?: string, fieldErrors?: FieldErrors): ActionFailure {
  return {
    ok: false,
    error: {
      code,
      message: message ?? publicMessageFor(code),
      ...(fieldErrors ? { fieldErrors } : {}),
    },
  }
}

export function validationFailed(error: z.ZodError): ActionFailure {
  return fail("VALIDATION", undefined, z.flattenError(error).fieldErrors as FieldErrors)
}
