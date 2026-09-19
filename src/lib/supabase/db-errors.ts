/**
 * Postgres errors as surfaced by PostgREST / supabase-js. Pure helpers so
 * features can turn constraint violations into field-level messages.
 *
 * Only the SQLSTATE code and constraint name are ever read or logged: the
 * `details` of a violation can echo the offending row (names, ids).
 */

export type DbErrorLike = {
  code?: string | undefined
  message?: string | undefined
}

export const PG_UNIQUE_VIOLATION = "23505"
export const PG_CHECK_VIOLATION = "23514"
export const PG_NOT_NULL_VIOLATION = "23502"

/**
 * The name of the violated constraint, from messages such as
 * `duplicate key value violates unique constraint "workspaces_slug_key"`.
 */
export function violatedConstraint(error: DbErrorLike): string | undefined {
  if (error.code !== PG_UNIQUE_VIOLATION && error.code !== PG_CHECK_VIOLATION) return undefined
  return /constraint "([^"]+)"/.exec(error.message ?? "")?.[1]
}
