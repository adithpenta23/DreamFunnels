/**
 * The Clients page search: one PostgREST `or=(…)` filter over the client's
 * name, business name and business email, plus its phone when the search
 * holds at least three digits ("(512) 555" finds +15125550100).
 *
 * User text never becomes filter syntax: LIKE wildcards are escaped, and
 * every value is double-quoted for PostgREST (with `"` and `\` escaped), so
 * commas, dots and parentheses stay literal. RLS and the agency filter the
 * query ANDs this with still decide which rows exist at all.
 */

/** `%`, `_` and `\` are wildcards/escapes in LIKE patterns; match them literally. */
export const escapeLike = (text: string) => text.replace(/[\\%_]/g, (character) => `\\${character}`)

const quoted = (value: string) => `"${value.replace(/["\\]/g, (character) => `\\${character}`)}"`

export function clientSearchFilter(search: string): string {
  const contains = quoted(`%${escapeLike(search)}%`)
  const conditions = [
    `name.ilike.${contains}`,
    `business_name.ilike.${contains}`,
    `business_email.ilike.${contains}`,
  ]
  const digits = search.replace(/\D/g, "")
  if (digits.length >= 3) conditions.push(`business_phone.like.${quoted(`%${digits}%`)}`)
  return conditions.join(",")
}
