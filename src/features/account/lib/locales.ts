/**
 * Locales people can pick for how dates, times and numbers are formatted for
 * them (in emails and notifications first). The app's own copy is English
 * only; this is formatting, not translation.
 *
 * The database accepts any well-formed BCP 47 tag (profiles_locale_check), so
 * this list can grow without a migration.
 */
export const DEFAULT_LOCALE = "en-US"

export const SUPPORTED_LOCALES = [
  { value: "en-US", label: "English (United States)" },
  { value: "en-CA", label: "English (Canada)" },
  { value: "en-GB", label: "English (United Kingdom)" },
  { value: "en-AU", label: "English (Australia)" },
  { value: "en-NZ", label: "English (New Zealand)" },
  { value: "en-IE", label: "English (Ireland)" },
  { value: "en-IN", label: "English (India)" },
  { value: "en-ZA", label: "English (South Africa)" },
  { value: "es-US", label: "Español (Estados Unidos)" },
  { value: "es-MX", label: "Español (México)" },
  { value: "es-ES", label: "Español (España)" },
  { value: "fr-CA", label: "Français (Canada)" },
  { value: "fr-FR", label: "Français (France)" },
  { value: "de-DE", label: "Deutsch (Deutschland)" },
  { value: "it-IT", label: "Italiano (Italia)" },
  { value: "nl-NL", label: "Nederlands (Nederland)" },
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "pt-PT", label: "Português (Portugal)" },
] as const

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]["value"]

const SUPPORTED = new Set<string>(SUPPORTED_LOCALES.map((locale) => locale.value))

export function isSupportedLocale(value: string): value is SupportedLocale {
  return SUPPORTED.has(value)
}

/**
 * Best match for what a browser reports (navigator.language): the exact tag,
 * else the first supported locale with the same language ("en" -> en-US,
 * "es-AR" -> es-US), else null.
 */
export function matchLocale(value: string | null | undefined): SupportedLocale | null {
  const input = value?.trim()
  if (!input) return null
  let tag: string
  try {
    tag = Intl.getCanonicalLocales(input)[0] ?? ""
  } catch {
    return null
  }
  if (isSupportedLocale(tag)) return tag
  const language = tag.split("-")[0]
  return SUPPORTED_LOCALES.find((locale) => locale.value.startsWith(`${language}-`))?.value ?? null
}
