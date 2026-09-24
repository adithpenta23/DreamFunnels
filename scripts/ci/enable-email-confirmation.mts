/**
 * CI only: turns supabase/config.toml into the email-confirmation variant used
 * by the `e2e-confirmation` job, before `supabase start`:
 *   [auth.email]      enable_confirmations = true   (staging/production behaviour)
 *   [auth.rate_limit] email_sent = 100              (several sign-ups per run)
 *
 * The committed config (confirmation off, email_sent = 2) stays the local
 * default; this edits the CI runner's throwaway checkout. The Supabase CLI
 * doesn't document environment overrides for these keys, so the file is
 * edited by section, and the script fails if either key isn't where it's
 * expected rather than guessing.
 *
 * Refuses to run outside CI unless given --allow-local (then undo it with
 * `git checkout supabase/config.toml`).
 */

import { readFileSync, writeFileSync } from "node:fs"
import { pathToFileURL } from "node:url"

export const CONFIG_PATH = "supabase/config.toml"

export const OVERRIDES: readonly { section: string; key: string; value: string }[] = [
  { section: "auth.email", key: "enable_confirmations", value: "true" },
  { section: "auth.rate_limit", key: "email_sent", value: "100" },
]

/** Sets `key = value` inside `[section]` only. Throws if the key isn't there. */
export function setTomlValue(source: string, section: string, key: string, value: string): string {
  const lines = source.split("\n")
  let current = ""
  let replaced = false
  const result = lines.map((line) => {
    const header = /^\s*\[([^\]]+)\]\s*$/.exec(line)
    if (header?.[1]) {
      current = header[1].trim()
      return line
    }
    if (current === section && new RegExp(`^\\s*${key}\\s*=`).test(line)) {
      replaced = true
      return `${key} = ${value}`
    }
    return line
  })
  if (!replaced) throw new Error(`[${section}] ${key} not found in ${CONFIG_PATH}`)
  return result.join("\n")
}

export function main(argv: readonly string[] = process.argv.slice(2)): number {
  if (!process.env.CI && !argv.includes("--allow-local")) {
    console.error(
      `Refusing to edit ${CONFIG_PATH} outside CI. Pass --allow-local to do it anyway (undo with git checkout).`
    )
    return 1
  }
  let config = readFileSync(CONFIG_PATH, "utf8")
  for (const { section, key, value } of OVERRIDES) {
    config = setTomlValue(config, section, key, value)
    console.log(`[${section}] ${key} = ${value}`)
  }
  writeFileSync(CONFIG_PATH, config)
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main()
}
