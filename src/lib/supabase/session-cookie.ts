// Session cookies are `sb-<project-ref>-auth-token`, chunked as `.0`, `.1`, …
// when large. The PKCE `-code-verifier` cookie is not a session.
const SESSION_COOKIE = /^sb-.+-auth-token(\.\d+)?$/

/** True when any of the cookie names is a Supabase session cookie. */
export function hasSessionCookie(cookieNames: readonly string[]): boolean {
  return cookieNames.some((name) => SESSION_COOKIE.test(name))
}
