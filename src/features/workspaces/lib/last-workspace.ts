import { WORKSPACE_SLUG_PATTERN } from "./slug"

/**
 * "Which workspace did this user open last on this device?", so sign-in can
 * reopen it. A preference, not an authorization input: the slug is only used
 * after checking the user is still a member (see pickDefaultWorkspace).
 *
 * The value is `<userId>:<slug>`, so on a shared browser one person's choice
 * is never applied to another. It's written by the workspace layout on the
 * client (not by the proxy, which also sees link prefetches).
 */
export const LAST_WORKSPACE_COOKIE = "df_last_workspace"
export const LAST_WORKSPACE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

export function serializeLastWorkspace(userId: string, slug: string): string {
  return `${userId}:${slug}`
}

/** The remembered slug for `userId`, or null if absent, malformed or someone else's. */
export function parseLastWorkspace(value: string | undefined, userId: string): string | null {
  if (!value) return null
  let decoded: string
  try {
    decoded = decodeURIComponent(value)
  } catch {
    return null
  }
  const separator = decoded.lastIndexOf(":")
  if (separator <= 0) return null
  const owner = decoded.slice(0, separator)
  const slug = decoded.slice(separator + 1)
  return owner === userId && WORKSPACE_SLUG_PATTERN.test(slug) ? slug : null
}

/** A `document.cookie` assignment string for the preference. */
export function lastWorkspaceCookieString(userId: string, slug: string, secure: boolean): string {
  return [
    `${LAST_WORKSPACE_COOKIE}=${serializeLastWorkspace(userId, slug)}`,
    "Path=/",
    `Max-Age=${LAST_WORKSPACE_MAX_AGE_SECONDS}`,
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ")
}
