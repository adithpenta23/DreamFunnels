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

/** Leaving: the only refusal is being an agency's last owner. */
export function toLeaveError(error: DbErrorLike): AppError {
  if (isLastOwnerViolation(error)) {
    return new AppError(
      "CONFLICT",
      "You're the only owner of this workspace. Transfer ownership to another member first, then you can leave.",
      { expose: true, cause: error, context: { code: error.code } }
    )
  }
  return toMemberWriteError(error)
}

/** Outcomes of transfer_workspace_ownership() / make_workspace_owner() that change nothing. */
export type OwnershipRefusal = "not_member" | "already_owner" | "self"

const OWNERSHIP_REFUSALS: Record<OwnershipRefusal, string> = {
  not_member:
    "That person isn't a member of this workspace any more. Ownership can only go to a current member.",
  already_owner: "That person is already an owner of this workspace.",
  self: "You can't do that to your own membership.",
}

export function ownershipRefusalError(outcome: OwnershipRefusal): AppError {
  return new AppError(
    outcome === "not_member" ? "NOT_FOUND" : "CONFLICT",
    OWNERSHIP_REFUSALS[outcome],
    { expose: true, context: { outcome } }
  )
}

/** Failed ownership function calls: 42501 means the caller isn't allowed. */
export function toOwnershipWriteError(
  error: DbErrorLike,
  action: "transfer" | "make_owner"
): AppError {
  const context = { code: error.code, action }
  if (error.code === "42501") {
    return new AppError(
      "FORBIDDEN",
      action === "transfer"
        ? "Only a direct owner of this workspace can transfer its ownership."
        : "Only owners of a client workspace can make someone an owner.",
      { expose: true, cause: error, context }
    )
  }
  if (isLastOwnerViolation(error)) {
    return new AppError("CONFLICT", LAST_OWNER_MESSAGE, { expose: true, cause: error, context })
  }
  return new AppError("INTERNAL", "Ownership change failed", { cause: error, context })
}
