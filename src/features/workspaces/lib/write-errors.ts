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
    case "workspaces_client_name_key":
      return invalid(
        "CONFLICT",
        "workspaceName",
        "You already have a client with this name. Use a different workspace name."
      )
  }

  // Business profile: the form validates the same rules first, so reaching
  // these means the two drifted; still point at the right field.
  const profileField = constraint ? PROFILE_CONSTRAINT_FIELDS[constraint] : undefined
  if (profileField) {
    return invalid("VALIDATION", profileField, "Please check this value and try again.")
  }
  return new AppError("INTERNAL", "Workspace write failed", { cause: error, context })
}

/** CHECK constraint on public.workspaces -> business profile form field. */
const PROFILE_CONSTRAINT_FIELDS: Readonly<Record<string, string>> = {
  workspaces_timezone_check: "timezone",
  workspaces_business_name_check: "businessName",
  workspaces_business_email_check: "businessEmail",
  workspaces_business_phone_check: "businessPhone",
  workspaces_website_url_check: "websiteUrl",
  workspaces_address_line1_check: "addressLine1",
  workspaces_address_line2_check: "addressLine2",
  workspaces_address_city_check: "addressCity",
  workspaces_address_region_check: "addressRegion",
  workspaces_address_postal_code_check: "addressPostalCode",
  workspaces_address_country_check: "addressCountry",
  workspaces_logo_url_check: "logoUrl",
  workspaces_brand_primary_color_check: "brandPrimaryColor",
  workspaces_brand_secondary_color_check: "brandSecondaryColor",
}
