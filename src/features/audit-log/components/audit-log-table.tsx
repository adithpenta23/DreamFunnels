import type { DescribedAuditEvent } from "../lib/events"

export type AuditLogRow = DescribedAuditEvent & {
  key: string
  /** ISO timestamp, for <time dateTime>. */
  dateTime: string
  /** Formatted on the server in the workspace's time zone. */
  dateLabel: string
}

/**
 * The audit log. A table on wider screens; on phones the actor, action and
 * target columns fold away and the sentence (which names them) carries the
 * row, so nothing scrolls sideways.
 */
export function AuditLogTable({
  rows,
  caption,
}: {
  rows: readonly AuditLogRow[]
  caption: string
}) {
  return (
    <table className="w-full table-fixed text-sm">
      <caption className="sr-only">{caption}</caption>
      <thead className="border-b text-left text-xs text-muted-foreground">
        <tr>
          <th scope="col" className="w-32 pr-3 pb-2 font-medium sm:w-44">
            Date
          </th>
          <th scope="col" className="hidden w-36 pr-3 pb-2 font-medium md:table-cell">
            Actor
          </th>
          <th scope="col" className="hidden w-40 pr-3 pb-2 font-medium lg:table-cell">
            Action
          </th>
          <th scope="col" className="hidden w-44 pr-3 pb-2 font-medium xl:table-cell">
            Target
          </th>
          <th scope="col" className="pb-2 font-medium">
            Details
          </th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {rows.map((row) => (
          <tr key={row.key} className="align-top">
            <td className="py-3 pr-3 text-muted-foreground">
              <time dateTime={row.dateTime}>{row.dateLabel}</time>
            </td>
            <td className="hidden truncate py-3 pr-3 md:table-cell" title={row.actor}>
              {row.actor}
            </td>
            <td className="hidden py-3 pr-3 lg:table-cell">{row.action}</td>
            <td className="hidden truncate py-3 pr-3 xl:table-cell" title={row.target}>
              {row.target}
            </td>
            <td className="py-3 break-words">
              <span className="font-medium lg:hidden">{row.action}. </span>
              {row.sentence}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
