import { WORKSPACE_ROLE_LABELS } from "@/features/workspaces/lib/roles"
import type { InvitationPreview } from "../types"

const expiryFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "UTC",
})

/** What the invitation is for, as a definition list (screen readers pair each label and value). */
export function InvitationDetails({ invitation }: { invitation: InvitationPreview }) {
  const rows: [string, string][] = [
    ["Workspace", invitation.workspaceName],
    ["Invited by", invitation.inviterName ?? "A workspace admin"],
    ["Role", WORKSPACE_ROLE_LABELS[invitation.role]],
    ["For", invitation.email],
  ]
  if (invitation.status === "pending") {
    rows.push(["Expires", `${expiryFormat.format(new Date(invitation.expiresAt))} UTC`])
  }

  return (
    <dl className="grid gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="grid grid-cols-[6rem_1fr] gap-2">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 font-medium break-words">{value}</dd>
        </div>
      ))}
    </dl>
  )
}
