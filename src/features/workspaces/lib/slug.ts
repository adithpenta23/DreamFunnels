/**
 * Workspace URL slugs. Everything here mirrors the database so that what the
 * form says and what Postgres enforces never disagree:
 *   - WORKSPACE_SLUG_PATTERN    <-> CHECK on public.workspaces.slug
 *   - RESERVED_WORKSPACE_SLUGS  <-> private.is_reserved_workspace_slug()
 *   - slugify / suggestWorkspaceSlug <-> private.slugify() / create_workspace()
 */

/** 3–48 lowercase letters, digits or hyphens; no leading/trailing hyphen. */
export const WORKSPACE_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/

export const RESERVED_WORKSPACE_SLUGS: ReadonlySet<string> = new Set([
  "admin",
  "api",
  "app",
  "auth",
  "billing",
  "blog",
  "dashboard",
  "docs",
  "help",
  "login",
  "logout",
  "mail",
  "new",
  "onboarding",
  "settings",
  "signup",
  "static",
  "status",
  "support",
  "workspace",
  "workspaces",
  "www",
])

/** Length of the slug generated from a name, leaving room for a "-xxxxxx" suffix. */
const GENERATED_BASE_LENGTH = 40

export function isReservedWorkspaceSlug(slug: string): boolean {
  return RESERVED_WORKSPACE_SLUGS.has(slug)
}

export function isValidWorkspaceSlug(slug: string): boolean {
  return WORKSPACE_SLUG_PATTERN.test(slug) && !isReservedWorkspaceSlug(slug)
}

/**
 * Free text to slug: "Café Münster & Co." -> "cafe-munster-co". Accents are
 * folded, everything else that isn't a letter or digit becomes a hyphen.
 * May return "".
 */
export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * The URL the database will try first when a workspace is created without
 * one, for previews. Null when it will need a random suffix instead (the
 * name is too short, reserved, or has no usable characters); the database may
 * also add one if the URL is taken.
 */
export function suggestWorkspaceSlug(name: string): string | null {
  const base = slugify(name).slice(0, GENERATED_BASE_LENGTH).replace(/-+$/, "")
  return isValidWorkspaceSlug(base) ? base : null
}
