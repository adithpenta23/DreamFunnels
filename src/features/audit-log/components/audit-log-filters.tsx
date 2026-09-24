import type { Route } from "next"
import Form from "next/form"
import Link from "next/link"
import { FormField } from "@/components/forms/form-field"
import { buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AUDIT_EVENT_LABELS, AUDIT_EVENT_TYPES } from "../lib/events"
import type { AuditLogParams } from "../schemas"

const selectClass =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"

type AuditLogFiltersProps = {
  action: Route
  params: AuditLogParams
  actors: readonly { userId: string; name: string }[]
  dateError: string | null
}

/**
 * Filters for the audit log, as a plain GET form: the state lives in the URL
 * (shareable, back-button friendly), and a new filter starts from the newest
 * events (no cursor).
 */
export function AuditLogFilters({ action, params, actors, dateError }: AuditLogFiltersProps) {
  const filtered = Boolean(params.action || params.actor || params.from || params.to)
  return (
    <Form
      action={action}
      role="search"
      aria-label="Filter the audit log"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]"
    >
      <FormField id="audit-action" label="Action">
        <select name="action" defaultValue={params.action ?? ""} className={selectClass}>
          <option value="">All actions</option>
          {AUDIT_EVENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {AUDIT_EVENT_LABELS[type]}
            </option>
          ))}
        </select>
      </FormField>
      <FormField id="audit-actor" label="Done by">
        <select name="actor" defaultValue={params.actor ?? ""} className={selectClass}>
          <option value="">Anyone</option>
          {actors.map((actor) => (
            <option key={actor.userId} value={actor.userId}>
              {actor.name}
            </option>
          ))}
        </select>
      </FormField>
      <FormField id="audit-from" label="From" error={dateError ?? undefined}>
        <Input name="from" type="date" defaultValue={params.from ?? ""} />
      </FormField>
      <FormField id="audit-to" label="To">
        <Input name="to" type="date" defaultValue={params.to ?? ""} />
      </FormField>
      <div className="flex items-end gap-2">
        <button type="submit" className={buttonVariants({ variant: "outline" })}>
          Apply
        </button>
        {filtered ? (
          <Link href={action} className={buttonVariants({ variant: "ghost" })}>
            Clear
          </Link>
        ) : null}
      </div>
    </Form>
  )
}
