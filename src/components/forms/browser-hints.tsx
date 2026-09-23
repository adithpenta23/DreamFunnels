"use client"

import { useSyncExternalStore } from "react"

const noSubscription = () => () => {}
const browserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone
const browserLocale = () => navigator.language

/**
 * Hidden `timezone` and `locale` fields with the browser's settings, so new
 * workspaces and profiles start in the right time zone instead of UTC. They
 * are hints: the server validates them and ignores anything unusable. Empty
 * during server rendering, filled in on the client.
 */
export function BrowserHints() {
  const timezone = useSyncExternalStore(noSubscription, browserTimezone, () => "")
  const locale = useSyncExternalStore(noSubscription, browserLocale, () => "")
  return (
    <>
      <input type="hidden" name="timezone" value={timezone} />
      <input type="hidden" name="locale" value={locale} />
    </>
  )
}
