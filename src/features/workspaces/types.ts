import type { WorkspaceRole } from "./lib/roles"

/** A workspace as seen by one member: safe to pass to Client Components. */
export type WorkspaceSummary = {
  id: string
  name: string
  slug: string
  /**
   * The viewer's effective role: their own membership, or the role their
   * agency admin/owner membership carries into the agency's clients.
   */
  role: WorkspaceRole
  createdAt: string
}

/**
 * The business behind a workspace, as customers will see it (messages,
 * booking pages, websites). Null means "not provided".
 */
export type WorkspaceProfile = {
  /** IANA time zone, e.g. "America/Chicago". Always set. */
  timezone: string
  businessName: string | null
  businessEmail: string | null
  /** E.164, e.g. "+15125550100". */
  businessPhone: string | null
  addressLine1: string | null
  addressLine2: string | null
  addressCity: string | null
  addressRegion: string | null
  addressPostalCode: string | null
  /** ISO 3166-1 alpha-2, e.g. "US". */
  addressCountry: string | null
  logoUrl: string | null
  /** "#rrggbb" */
  brandPrimaryColor: string | null
  brandSecondaryColor: string | null
}
