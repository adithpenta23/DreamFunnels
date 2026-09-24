/**
 * The audit events a workspace's owners and admins can read, and how each is
 * worded. Rows come from public.list_workspace_audit_events(), which returns
 * display names and an allowlisted `details` object: no ids, tokens or raw
 * JSON reach the page, and this module turns them into sentences.
 */

export const AUDIT_EVENT_TYPES = [
  "workspace.member_invited",
  "workspace.invitation_resent",
  "workspace.invitation_revoked",
  "workspace.invitation_accepted",
  "workspace.member_added",
  "workspace.member_removed",
  "workspace.member_role_changed",
  "workspace.member_left",
  "workspace.ownership_transferred",
  "workspace.owner_granted",
  "workspace.client_created",
] as const

export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number]

/** Short labels for the Action column and the filter. */
export const AUDIT_EVENT_LABELS: Record<AuditEventType, string> = {
  "workspace.member_invited": "Member invited",
  "workspace.invitation_resent": "Invitation resent",
  "workspace.invitation_revoked": "Invitation cancelled",
  "workspace.invitation_accepted": "Invitation accepted",
  "workspace.member_added": "Member added",
  "workspace.member_removed": "Member removed",
  "workspace.member_role_changed": "Role changed",
  "workspace.member_left": "Member left",
  "workspace.ownership_transferred": "Ownership transferred",
  "workspace.owner_granted": "Owner added",
  "workspace.client_created": "Client created",
}

export function isAuditEventType(value: string): value is AuditEventType {
  return (AUDIT_EVENT_TYPES as readonly string[]).includes(value)
}

/** What the read function may put in `details` (see the migration's allowlist). */
export type AuditDetails = {
  role?: string
  from?: string
  to?: string
  previous_owner_role?: string
  already_member?: boolean
  method?: string
  client_name?: string
}

export type AuditEvent = {
  /** Keyset cursor only; never shown. */
  id: string
  createdAt: string
  eventType: string
  actorName: string | null
  targetName: string | null
  targetEmail: string | null
  details: AuditDetails
}

const ROLE_WORDS: Record<string, string> = {
  member: "a member",
  admin: "an admin",
  owner: "an owner",
}

const roleWord = (role: string | undefined) => (role ? (ROLE_WORDS[role] ?? role) : "a member")
const bareRole = (role: string | undefined) => (role && role in ROLE_WORDS ? role : "unknown")

/** Reads the `details` object defensively: only known keys with the right types. */
export function toAuditDetails(value: unknown): AuditDetails {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {}
  const source = value as Record<string, unknown>
  const details: AuditDetails = {}
  for (const key of [
    "role",
    "from",
    "to",
    "previous_owner_role",
    "method",
    "client_name",
  ] as const) {
    const entry = source[key]
    if (typeof entry === "string") details[key] = entry
  }
  if (typeof source.already_member === "boolean") details.already_member = source.already_member
  return details
}

export type DescribedAuditEvent = {
  /** Who did it: a person's name, or "System" for trusted background work. */
  actor: string
  /** The Action column. */
  action: string
  /** Who or what it was done to (may be empty). */
  target: string
  /** The Details column, as a sentence. */
  sentence: string
}

/** Turns one event into the words the audit log shows. Pure; unit-tested. */
export function describeAuditEvent(event: AuditEvent): DescribedAuditEvent {
  const actor = event.actorName?.trim() || "System"
  const person = event.targetName?.trim() || event.targetEmail || "a former member"
  const email = event.targetEmail || person
  const { details } = event
  const action = isAuditEventType(event.eventType)
    ? AUDIT_EVENT_LABELS[event.eventType]
    : "Other change"

  switch (event.eventType) {
    case "workspace.member_invited":
      return {
        actor,
        action,
        target: email,
        sentence: `${actor} invited ${email} to join as ${roleWord(details.role)}.`,
      }
    case "workspace.invitation_resent":
      return {
        actor,
        action,
        target: email,
        sentence: `${actor} sent the invitation to ${email} again, with a new link.`,
      }
    case "workspace.invitation_revoked":
      return {
        actor,
        action,
        target: email,
        sentence: `${actor} cancelled the invitation to ${email}.`,
      }
    case "workspace.invitation_accepted": {
      const via = details.method === "pending_list" ? " from their pending invitations" : ""
      return {
        actor,
        action,
        target: person,
        sentence: details.already_member
          ? `${person} accepted an invitation${via} but was already a member, so their role didn't change.`
          : `${person} accepted the invitation${via} and joined as ${roleWord(details.role)}.`,
      }
    }
    case "workspace.member_added":
      return {
        actor,
        action,
        target: person,
        sentence: `${person} became ${roleWord(details.role)} of this workspace.`,
      }
    case "workspace.member_removed":
      return {
        actor,
        action,
        target: person,
        sentence: `${actor} removed ${person} (${bareRole(details.role)}) from this workspace.`,
      }
    case "workspace.member_role_changed":
      return {
        actor,
        action,
        target: person,
        sentence: `${actor} changed ${person}'s role from ${bareRole(details.from)} to ${bareRole(details.to)}.`,
      }
    case "workspace.member_left":
      return {
        actor,
        action,
        target: person,
        sentence: `${person} left this workspace (was ${roleWord(details.role)}).`,
      }
    case "workspace.ownership_transferred":
      return {
        actor,
        action,
        target: person,
        sentence: `${person} became workspace owner; ${actor} became ${bareRole(details.previous_owner_role ?? "admin")}.`,
      }
    case "workspace.owner_granted":
      return {
        actor,
        action,
        target: person,
        sentence: `${actor} made ${person} an owner (previously ${roleWord(details.from)}).`,
      }
    case "workspace.client_created":
      return {
        actor,
        action,
        target: details.client_name ?? "Deleted client",
        sentence: details.client_name
          ? `${actor} created the client workspace ${details.client_name}.`
          : `${actor} created a client workspace that has since been deleted.`,
      }
    default:
      return { actor, action, target: "", sentence: `${actor} made a change to this workspace.` }
  }
}
