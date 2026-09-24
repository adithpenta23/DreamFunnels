/**
 * Fails when src/types/database.types.ts doesn't match the local database's
 * schema: a migration changed without `npm run db:types`, or the file was
 * edited by hand.
 *
 * It generates the types exactly as `npm run db:types` does (the same CLI
 * call, formatted with the repository's Prettier config for that path) but
 * compares in memory, so the working tree is never touched.
 *
 * Needs the local database with every migration applied (`npm run db:start`,
 * or `npx supabase db start` in CI). Usage: npm run db:types:check
 */

import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import * as prettier from "prettier"

export const TYPES_FILE = "src/types/database.types.ts"

/** Line numbers (1-based) where two texts differ, at most `limit` of them. */
export function differingLines(expected: string, actual: string, limit = 10): number[] {
  const left = expected.split("\n")
  const right = actual.split("\n")
  const lines: number[] = []
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    if (left[index] !== right[index]) lines.push(index + 1)
    if (lines.length >= limit) break
  }
  return lines
}

function generate(): string {
  const result = spawnSync(
    "npx",
    ["supabase", "gen", "types", "typescript", "--local", "--schema", "public"],
    { encoding: "utf8", shell: process.platform === "win32", maxBuffer: 32 * 1024 * 1024 }
  )
  if (result.status !== 0 || !result.stdout) {
    throw new Error(
      `supabase gen types failed (exit ${result.status}). Is the local database running with every migration?\n${result.stderr ?? ""}`
    )
  }
  return result.stdout
}

export async function main(): Promise<number> {
  const filepath = path.resolve(TYPES_FILE)
  const config = (await prettier.resolveConfig(filepath)) ?? {}
  const generated = await prettier.format(generate(), { ...config, filepath })
  const committed = readFileSync(filepath, "utf8").replace(/\r\n/g, "\n")

  if (generated === committed) {
    console.log(`PASS  ${TYPES_FILE} matches the local database schema.`)
    return 0
  }
  console.error(
    `FAIL  ${TYPES_FILE} is out of date with the migrations (first differing lines: ${differingLines(generated, committed).join(", ")}).\n` +
      "      Run `npm run db:types` against a database with every migration applied, and commit the result. Never edit the file by hand."
  )
  return 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main()
}
