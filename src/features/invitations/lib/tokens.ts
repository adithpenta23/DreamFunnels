/**
 * Invitation token format, safe anywhere. The token is 32 random bytes in
 * base64url (43 characters); only its SHA-256 is stored (see
 * ../server/tokens.ts). Checking the shape first means malformed links never
 * reach the database.
 */

export const INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

export function isWellFormedInvitationToken(value: unknown): value is string {
  return typeof value === "string" && INVITATION_TOKEN_PATTERN.test(value)
}

const INVITATION_PATH = /^\/invite\/([A-Za-z0-9_-]{43})$/

/** The token in an invitation path ("/invite/<token>"), or null. */
export function invitationTokenFromPath(path: string | null | undefined): string | null {
  return INVITATION_PATH.exec(path ?? "")?.[1] ?? null
}

/**
 * Hides the token in a path before it's logged or reported:
 * "/invite/abc…" -> "/invite/[token]". Our logs never carry invitation tokens.
 */
export function redactInvitationPath(path: string): string {
  return path.replace(/^\/invite\/[^/?#]+/, "/invite/[token]")
}

/** How long an invitation stays valid; the database sets expires_at (7 days). */
export const INVITATION_LIFETIME_DAYS = 7
