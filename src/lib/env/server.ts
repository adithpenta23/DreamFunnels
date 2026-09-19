import "server-only"

import { parseServerEnv } from "./schema"

/** Server-only configuration. Importing this from a Client Component fails the build. */
export const serverEnv = parseServerEnv(process.env)
