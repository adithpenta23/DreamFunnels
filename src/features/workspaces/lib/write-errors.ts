import { AppError } from "@/lib/errors"
import { violatedConstraint, type DbErrorLike } from "@/lib/supabase/db-errors"

/**
 * Maps a failed workspace insert/update to an AppError whose field errors
 * match the form inputs (`workspaceName`, `workspaceSlug`). The database is
 * the final judge of slug uniqueness: RLS hides other tenants' workspaces, so
 * the app can't check availability up front without leaking them.
 */
export function toWorkspaceWriteError(error: DbErrorLike): AppError {
  const constraint = violatedConstraint(error)
  const context = { code: error.code, constraint }
  const invalid = (code: "CONFLICT" | "VALIDATION", field: string, message: string) =>
    new AppError(code, `Workspace ${constraint}`, {
      cause: error,
      context,
      fieldErrors: { [field]: [message] },
    })

  switch (constraint) {
    case "workspaces_slug_key":
      return invalid("CONFLICT", "workspaceSlug", "That URL is already taken. Please try another.")
    case "workspaces_slug_not_reserved":
      return invalid("VALIDATION", "workspaceSlug", "That URL is reserved. Please choose another.")
    case "workspaces_slug_check":
      return invalid(
        "VALIDATION",
        "workspaceSlug",
        "Use 3–48 lowercase letters, numbers or hyphens, starting and ending with a letter or number."
      )
    case "workspaces_name_check":
      return invalid("VALIDATION", "workspaceName", "Enter a name of 1–80 characters.")
    default:
      return new AppError("INTERNAL", "Workspace write failed", { cause: error, context })
  }
}
