"use client"

import { useEffect } from "react"
import { lastWorkspaceCookieString } from "../lib/last-workspace"

/**
 * Remembers the open workspace so the next sign-in on this device reopens it.
 * Runs only when a workspace is actually shown (unlike the proxy, which also
 * sees link prefetches). A preference, re-validated on the server.
 */
export function RememberWorkspace({ userId, slug }: { userId: string; slug: string }) {
  useEffect(() => {
    document.cookie = lastWorkspaceCookieString(userId, slug, window.location.protocol === "https:")
  }, [userId, slug])

  return null
}
