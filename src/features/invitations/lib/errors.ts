import { AppError } from "@/lib/errors"
import { violatedConstraint, type DbErrorLike } from "@/lib/supabase/db-errors"

/**
 * Maps a failed invitation function call to an AppError. Only the SQLSTATE and
 * constraint name are read: messages and details can echo the address.
 */
export function toInvitationWriteError(error: DbErrorLike): AppError {
  const context = { code: error.code, constraint: violatedConstraint(error) }

  switch (error.code) {
    case "42501":
      return new AppError("FORBIDDEN", "Only workspace owners and admins can manage invitations.", {
        expose: true,
        cause: error,
        context,
      })
    case "22023":
      return new AppError("VALIDATION", "Invalid invitation role", {
        cause: error,
        context,
        fieldErrors: { role: ["Choose member or admin."] },
      })
    case "28000":
      return new AppError("UNAUTHENTICATED", "Not signed in", { cause: error, context })
  }

  switch (context.constraint) {
    case "workspace_invitations_email_check":
      return new AppError("VALIDATION", "Invalid invitation email", {
        cause: error,
        context,
        fieldErrors: { email: ["Enter a valid email address."] },
      })
    case "workspace_invitations_message_check":
      return new AppError("VALIDATION", "Invalid invitation message", {
        cause: error,
        context,
        fieldErrors: { message: ["Keep the message to 500 characters or fewer."] },
      })
  }
  return new AppError("INTERNAL", "Invitation write failed", { cause: error, context })
}

/** Outcomes of accept_workspace_invitation() that don't let the user in. */
export type AcceptFailure =
  "invalid" | "revoked" | "expired" | "already_used" | "email_mismatch" | "email_unverified"

const ACCEPT_FAILURES: Record<AcceptFailure, AppError> = {
  invalid: new AppError(
    "NOT_FOUND",
    "This invitation link isn't valid. Check you copied the whole link.",
    {
      expose: true,
    }
  ),
  revoked: new AppError("CONFLICT", "This invitation was cancelled. Ask for a new one.", {
    expose: true,
  }),
  expired: new AppError("CONFLICT", "This invitation has expired. Ask for a new one.", {
    expose: true,
  }),
  already_used: new AppError("CONFLICT", "This invitation has already been used.", {
    expose: true,
  }),
  email_mismatch: new AppError(
    "FORBIDDEN",
    "This invitation was sent to a different email address. Sign in with that address to accept it.",
    { expose: true }
  ),
  email_unverified: new AppError(
    "FORBIDDEN",
    "Confirm your email address first, then open the invitation again.",
    { expose: true }
  ),
}

export function acceptFailureError(outcome: AcceptFailure): AppError {
  const template = ACCEPT_FAILURES[outcome]
  return new AppError(template.code, template.message, {
    expose: true,
    context: { outcome },
  })
}
