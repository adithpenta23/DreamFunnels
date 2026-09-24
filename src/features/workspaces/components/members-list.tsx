"use client"

import { initialsOf } from "@/components/providers/app-context"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { memberActionsFor } from "../lib/members"
import { WORKSPACE_ROLE_LABELS, type WorkspaceRole } from "../lib/roles"
import type { WorkspaceMember, WorkspaceType } from "../types"
import { MemberRowActions } from "./member-row-actions"

export type MemberRow = WorkspaceMember & {
  /** Formatted on the server, so every browser renders the same text. */
  joinedLabel: string
}

type MembersListProps = {
  workspaceId: string
  workspaceName: string
  workspaceType: WorkspaceType
  viewer: { userId: string; role: WorkspaceRole }
  members: readonly MemberRow[]
}

/**
 * The workspace's direct members. Owners and admins get a menu per row
 * (change role, remove) where memberActionsFor() allows it; everyone else sees
 * the list read-only. The server re-checks every action.
 */
export function MembersList({
  workspaceId,
  workspaceName,
  workspaceType,
  viewer,
  members,
}: MembersListProps) {
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">Members of {workspaceName}</caption>
      <thead className="border-b text-left text-xs text-muted-foreground">
        <tr>
          <th scope="col" className="pb-2 font-medium">
            Name
          </th>
          <th scope="col" className="pb-2 font-medium">
            Role
          </th>
          <th scope="col" className="hidden pb-2 font-medium sm:table-cell">
            Joined
          </th>
          <th scope="col" className="w-10 pb-2">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {members.map((member) => {
          const isViewer = member.userId === viewer.userId
          const displayName = member.fullName?.trim() || member.email || "Unnamed member"
          const actions = memberActionsFor(viewer, member)
          return (
            <tr key={member.userId}>
              <td className="py-3 pr-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar size="sm" aria-hidden>
                    <AvatarFallback>{initialsOf(member.fullName, member.email)}</AvatarFallback>
                  </Avatar>
                  <div className="grid min-w-0">
                    <span className="flex items-center gap-2 font-medium">
                      <span className="truncate">{displayName}</span>
                      {isViewer ? (
                        <Badge variant="secondary" className="shrink-0">
                          You
                        </Badge>
                      ) : null}
                    </span>
                    {member.fullName?.trim() && member.email ? (
                      <span className="text-xs break-all text-muted-foreground">
                        {member.email}
                      </span>
                    ) : null}
                  </div>
                </div>
              </td>
              <td className="py-3 pr-3">
                <Badge variant={member.role === "member" ? "outline" : "secondary"}>
                  {WORKSPACE_ROLE_LABELS[member.role]}
                </Badge>
              </td>
              <td className="hidden py-3 pr-3 text-muted-foreground sm:table-cell">
                {member.joinedLabel}
              </td>
              <td className="py-3 text-right">
                {actions.canChangeRole || actions.canRemove ? (
                  <MemberRowActions
                    workspaceId={workspaceId}
                    workspaceName={workspaceName}
                    workspaceType={workspaceType}
                    member={{ userId: member.userId, role: member.role, displayName }}
                    actions={actions}
                  />
                ) : null}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
