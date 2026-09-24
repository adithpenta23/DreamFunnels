import { AppError } from "@/lib/errors"
import type { DbErrorLike } from "@/lib/supabase/db-errors"

/**
 * Maps a failed membership update/delete to an AppError users understand.
 * The last-owner rule lives in the database (private.protect_last_owner); this
 * only translates it.
 */

const LAST_OWNER_MESSAGE =
  "A workspace needs at least one owner, so its last owner can't be removed or given another role."

export function isLastOwnerViolation(error: DbErrorLike): boolean {
  return error.code === "P0001" && /at least one owner/i.test(error.message ?? "")
}

export function toMemberWriteError(error: DbErrorLike): AppError {
  const context = { code: error.code }
  if (isLastOwnerViolation(error)) {
    return new AppError("CONFLICT", LAST_OWNER_MESSAGE, { expose: true, cause: error, context })
  }
  // RLS WITH CHECK: e.g. an admin trying to make someone an owner.
  if (error.code === "42501") {
    return new AppError("FORBIDDEN", "Only owners can give or take away ownership.", {
      expose: true,
      cause: error,
      context,
    })
  }
  return new AppError("INTERNAL", "Membership write failed", { cause: error, context })
}
