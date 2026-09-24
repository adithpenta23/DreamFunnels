import { z } from "zod"
import { AUDIT_EVENT_TYPES } from "./lib/events"

/**
 * The audit log page's URL state. Filters are optional and a malformed value
 * is dropped rather than failing the page; a date range that ends before it
 * starts is reported so the form can say so.
 *   action  one of AUDIT_EVENT_TYPES
 *   actor   a member's user id
 *   from/to calendar days (YYYY-MM-DD) in the workspace's time zone, inclusive
 *   before  the keyset cursor: the id of the last event on the previous page
 */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional()).catch(undefined)

export const auditLogParamsSchema = z.object({
  action: optional(z.enum(AUDIT_EVENT_TYPES)),
  actor: optional(z.uuid()),
  from: optional(z.iso.date()),
  to: optional(z.iso.date()),
  before: optional(z.string().regex(/^[1-9][0-9]{0,17}$/)),
})

export type AuditLogParams = z.infer<typeof auditLogParamsSchema>

export type AuditLogFilters = {
  params: AuditLogParams
  /** Set when the dates can't be used; the page shows it and runs no query. */
  dateError: string | null
}

export function parseAuditLogParams(raw: Record<string, string | string[] | undefined>) {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)
  const params = auditLogParamsSchema.parse({
    action: first(raw.action),
    actor: first(raw.actor),
    from: first(raw.from),
    to: first(raw.to),
    before: first(raw.before),
  })
  const dateError =
    params.from && params.to && params.from > params.to
      ? "The start date is after the end date."
      : null
  return { params, dateError } satisfies AuditLogFilters
}
