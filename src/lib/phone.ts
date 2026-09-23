import { z } from "zod"

/**
 * Phone numbers are stored in E.164 ("+15125550100"): the format SMS and voice
 * providers require, and unambiguous across countries. Mirrors the CHECKs on
 * profiles.phone and workspaces.business_phone.
 *
 * People type numbers with spaces, dashes, dots and brackets, so those are
 * dropped; "00" as an international prefix becomes "+". The country code is
 * required: guessing it from a national number would need a numbering-plan
 * library for a small convenience.
 */

export const E164_PATTERN = /^\+[1-9][0-9]{6,14}$/

export const PHONE_HINT = "Include the country code, e.g. +1 512 555 0100."

/** Best-effort normalisation; the result still has to match E164_PATTERN. */
export function normalizePhone(input: string): string {
  const compact = input.trim().replace(/[\s().\- ]/g, "")
  return compact.startsWith("00") ? `+${compact.slice(2)}` : compact
}

/** Optional phone field: blank or missing means "none" (null); anything else must be E.164. */
export const optionalPhoneSchema = z
  .string()
  .max(40, { error: "That phone number is too long." })
  .nullish()
  .transform((value) => normalizePhone(value ?? ""))
  .pipe(
    z.union([
      z.literal("").transform(() => null),
      z.string().regex(E164_PATTERN, { error: `Enter a valid phone number. ${PHONE_HINT}` }),
    ])
  )
