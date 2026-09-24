import type { WorkspaceRole } from "./lib/roles"

export type WorkspaceType = "agency" | "client"

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
  /** `agency`: top level (every self-serve workspace). `client`: managed by `parentId`. */
  type: WorkspaceType
  /** The owning agency of a client; null for agencies. Not necessarily visible to the viewer. */
  parentId: string | null
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
  /** The business's existing website (http or https). */
  websiteUrl: string | null
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

/** A row in an agency's client list. */
export type ClientSummary = {
  id: string
  name: string
  slug: string
  businessName: string | null
  businessEmail: string | null
  businessPhone: string | null
  timezone: string
  createdAt: string
  /** Direct members (agency staff reach clients through the agency and aren't counted). */
  memberCount: number
  /** Open, unexpired invitations. */
  pendingInvitationCount: number
}

/** A direct member of a workspace, for the members page. */
export type WorkspaceMember = {
  userId: string
  fullName: string | null
  email: string | null
  role: WorkspaceRole
  joinedAt: string
}
