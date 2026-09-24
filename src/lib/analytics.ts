import { logger } from "@/lib/logger"

/**
 * Product analytics seam (PostHog-ready).
 *
 * Features call `track()` with an event from the typed catalog below. Until a
 * provider is registered, events are only debug-logged. To add PostHog,
 * install `posthog-js`, initialise it in `src/instrumentation-client.ts` when
 * NEXT_PUBLIC_POSTHOG_KEY is set, and pass it to `setAnalyticsProvider`.
 *
 * Privacy rule: never put PII (emails, names, free text) in event properties.
 */

/** Event name -> property shape. Add events here before tracking them. */
export type AnalyticsEvents = {
  signup_confirmation_sent: Record<string, never>
  password_reset_requested: Record<string, never>
  password_changed: { via: "settings" | "reset_link" }
  profile_updated: Record<string, never>
  workspace_updated: { slugChanged: boolean }
  workspace_profile_updated: Record<string, never>
  client_created: { invitationSent: boolean }
  member_invited: { role: "member" | "admin" }
  invitation_resent: Record<string, never>
  invitation_revoked: Record<string, never>
  invitation_accepted: Record<string, never>
  member_role_changed: { role: "member" | "admin" }
  member_removed: Record<string, never>
}

export type AnalyticsEventName = keyof AnalyticsEvents

export type AnalyticsProvider = {
  capture: (event: string, properties?: Record<string, unknown>) => void
  identify: (distinctId: string) => void
  reset: () => void
}

let provider: AnalyticsProvider | null = null

export function setAnalyticsProvider(next: AnalyticsProvider | null) {
  provider = next
}

type PropsArg<E extends AnalyticsEventName> =
  AnalyticsEvents[E] extends Record<string, never> ? [] : [properties: AnalyticsEvents[E]]

export function track<E extends AnalyticsEventName>(event: E, ...[properties]: PropsArg<E>) {
  logger.debug("analytics.track", { analyticsEvent: event, properties })
  provider?.capture(event, properties)
}

export function identify(userId: string) {
  provider?.identify(userId)
}

export function resetAnalytics() {
  provider?.reset()
}
