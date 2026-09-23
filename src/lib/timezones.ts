import { z } from "zod"
import { TIMEZONE_IDS } from "./timezone-ids"

/**
 * IANA time zones. What we store is always a canonical zone id such as
 * "America/Chicago" — never an offset like "-5", which loses daylight saving.
 * The database enforces the same shape (private.is_valid_timezone).
 *
 * Pure and isomorphic. Labels come from Intl, so build option lists on the
 * server and pass them down: server and browser ICU data can differ.
 */

export { TIMEZONE_IDS }
export type TimezoneId = (typeof TIMEZONE_IDS)[number]

export const DEFAULT_TIMEZONE: TimezoneId = "UTC"

/** Mirrors the format check in private.is_valid_timezone(). */
export const TIMEZONE_PATTERN = /^(UTC|[A-Z][A-Za-z]+(\/[A-Z][A-Za-z0-9_+-]*)+)$/

const SUPPORTED = new Set<string>(TIMEZONE_IDS)

/**
 * Old names that runtimes still report (ICU/CLDR keeps them as canonical)
 * mapped to the current IANA name we store.
 */
const LEGACY_NAMES: Readonly<Record<string, TimezoneId>> = {
  "Africa/Asmera": "Africa/Asmara",
  "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
  "America/Catamarca": "America/Argentina/Catamarca",
  "America/Coral_Harbour": "America/Atikokan",
  "America/Cordoba": "America/Argentina/Cordoba",
  "America/Godthab": "America/Nuuk",
  "America/Indianapolis": "America/Indiana/Indianapolis",
  "America/Jujuy": "America/Argentina/Jujuy",
  "America/Louisville": "America/Kentucky/Louisville",
  "America/Mendoza": "America/Argentina/Mendoza",
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Rangoon": "Asia/Yangon",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Atlantic/Faeroe": "Atlantic/Faroe",
  "Europe/Kiev": "Europe/Kyiv",
  "Pacific/Enderbury": "Pacific/Kanton",
  "Pacific/Ponape": "Pacific/Pohnpei",
  "Pacific/Truk": "Pacific/Chuuk",
}

const UTC_NAMES = new Set([
  "UTC",
  "Etc/UTC",
  "Etc/UCT",
  "UCT",
  "GMT",
  "Etc/GMT",
  "Zulu",
  "Etc/Zulu",
])

export function isSupportedTimezone(value: string): value is TimezoneId {
  return SUPPORTED.has(value)
}

/**
 * Maps what a browser or runtime reports ("Asia/Calcutta", "US/Eastern",
 * "Etc/UTC") to one of TIMEZONE_IDS, or null for anything else, including
 * offsets such as "-05:00".
 */
export function canonicalTimezone(value: string | null | undefined): TimezoneId | null {
  const input = value?.trim()
  if (!input) return null
  if (isSupportedTimezone(input)) return input
  if (UTC_NAMES.has(input)) return DEFAULT_TIMEZONE
  const legacy = LEGACY_NAMES[input]
  if (legacy) return legacy
  try {
    // Resolves links such as "US/Eastern" -> "America/New_York".
    const resolved = new Intl.DateTimeFormat("en-US", { timeZone: input }).resolvedOptions()
      .timeZone
    const candidate = LEGACY_NAMES[resolved] ?? resolved
    return isSupportedTimezone(candidate) ? candidate : null
  } catch {
    return null
  }
}

/** A required time zone field: any name canonicalTimezone() understands, stored canonically. */
export const timezoneSchema = z.string({ error: "Choose a time zone." }).transform((value, ctx) => {
  const zone = canonicalTimezone(value)
  if (!zone) {
    ctx.addIssue({ code: "custom", message: "Choose a time zone from the list." })
    return z.NEVER
  }
  return zone
})

export type TimezoneOption = {
  value: TimezoneId
  /** "Central Time — Chicago" */
  label: string
  /** "GMT-5" at the time the options were built. */
  offset: string
  /** "America/Chicago · GMT-5": the canonical id, shown under the label. */
  description: string
  /** Extra text the picker matches on (the IANA id, the offset). */
  keywords: string
}

function zoneName(
  timeZone: string,
  style: "longGeneric" | "longOffset",
  now: Date,
  locale: string
) {
  return (
    new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: style })
      .formatToParts(now)
      .find((part) => part.type === "timeZoneName")?.value ?? ""
  )
}

/** "America/Indiana/Knox" -> "Knox, Indiana"; "Asia/Ho_Chi_Minh" -> "Ho Chi Minh". */
export function timezoneCity(id: string): string {
  const [, ...places] = id.split("/")
  if (places.length === 0) return id
  return places
    .reverse()
    .map((place) => place.replaceAll("_", " "))
    .join(", ")
}

/** "GMT-05:00" -> -300; "GMT" -> 0. */
function offsetMinutes(longOffset: string): number {
  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(longOffset)
  if (!match) return 0
  const minutes = Number(match[2]) * 60 + Number(match[3])
  return match[1] === "-" ? -minutes : minutes
}

/** "GMT-05:00" -> "GMT-5", "GMT+05:30" -> "GMT+5:30", "GMT" -> "GMT+0". */
function shortOffset(longOffset: string): string {
  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(longOffset)
  if (!match) return "GMT+0"
  const hours = String(Number(match[2]))
  return `GMT${match[1]}${hours}${match[3] === "00" ? "" : `:${match[3]}`}`
}

/** A readable name for one zone: "Eastern Time — New York". */
export function timezoneLabel(id: string, now = new Date(), locale = "en-US"): string {
  if (id === "UTC") return "Coordinated Universal Time (UTC)"
  const city = timezoneCity(id)
  let generic = ""
  try {
    generic = zoneName(id, "longGeneric", now, locale)
  } catch {
    return id
  }
  // Zones without a name of their own fall back to "GMT-03:00"; the offset is
  // shown separately, so just use the place.
  return generic && !generic.startsWith("GMT") ? `${generic} — ${city}` : city
}

let cached: { key: string; options: TimezoneOption[] } | null = null

/**
 * Every supported zone as a picker option, west to east by current offset.
 * Offsets reflect `now` (daylight saving), so the list is rebuilt daily.
 */
export function timezoneOptions(now = new Date(), locale = "en-US"): TimezoneOption[] {
  const key = `${locale}:${now.toISOString().slice(0, 10)}`
  if (cached?.key === key) return cached.options

  const options = TIMEZONE_IDS.map((value) => {
    const longOffset = value === "UTC" ? "GMT" : zoneName(value, "longOffset", now, locale)
    const offset = shortOffset(longOffset)
    return {
      option: {
        value,
        label: timezoneLabel(value, now, locale),
        offset,
        description: `${value} · ${offset}`,
        keywords: `${value} ${value.replaceAll("_", " ")} ${offset}`,
      },
      minutes: offsetMinutes(longOffset),
    }
  })
    .sort((a, b) => a.minutes - b.minutes || a.option.label.localeCompare(b.option.label))
    .map(({ option }) => option)

  cached = { key, options }
  return options
}
