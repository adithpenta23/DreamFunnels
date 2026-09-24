import "server-only"

import { createHash, randomBytes } from "node:crypto"

/**
 * Invitation secrets. The token is 256 bits from the OS CSPRNG, so it can't be
 * guessed or enumerated. It lives only in the emailed link; the database keeps
 * its SHA-256 (hex), which is enough to find the invitation and useless to
 * anyone who reads the table. A fast hash is right here: the input already has
 * full entropy, so there's nothing for a slow KDF to protect.
 *
 * Lookups compare hashes inside Postgres (a unique index), never in app code,
 * so there's no timing side channel on the token itself.
 */

export function generateInvitationToken(): string {
  return randomBytes(32).toString("base64url")
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex")
}
