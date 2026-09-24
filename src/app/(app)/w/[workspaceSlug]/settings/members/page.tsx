import { InfoIcon, MailIcon, UsersIcon } from "lucide-react"
import type { Metadata } from "next"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requireUser } from "@/features/auth/server/session"
import { InviteMemberDialog } from "@/features/invitations/components/invite-member-dialog"
import {
  PendingInvitations,
  type PendingInvitationRow,
} from "@/features/invitations/components/pending-invitations"
import { invitationRowStatus, invitationStatusDetail } from "@/features/invitations/lib/display"
import { listOpenInvitations } from "@/features/invitations/server/queries"
import { MembersList, type MemberRow } from "@/features/workspaces/components/members-list"
import { canManageMembers } from "@/features/workspaces/lib/members"
import {
  getVisibleParentAgency,
  getWorkspaceProfile,
  listWorkspaceMembers,
  requireWorkspaceMember,
} from "@/features/workspaces/server/queries"

export const metadata: Metadata = { title: "Members" }

/**
 * Who's in this workspace, and (for owners and admins) who's been invited.
 * Members see the list read-only; the invite, role and removal controls are
 * shown to those allowed to use them, and every action re-checks on the server.
 */
export default async function MembersPage({
  params,
}: PageProps<"/w/[workspaceSlug]/settings/members">) {
  const { workspaceSlug } = await params
  const [workspace, viewer] = await Promise.all([
    requireWorkspaceMember(workspaceSlug),
    requireUser(),
  ])
  const canManage = canManageMembers(workspace.role)
  const [members, invitations, profile, agency] = await Promise.all([
    listWorkspaceMembers(workspace.id),
    canManage ? listOpenInvitations(workspace.id) : Promise.resolve([]),
    getWorkspaceProfile(workspace.id),
    getVisibleParentAgency(workspace),
  ])

  const now = new Date()
  const date = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: profile.timezone })
  const memberRows: MemberRow[] = members.map((member) => ({
    ...member,
    joinedLabel: date.format(new Date(member.joinedAt)),
  }))
  const invitationRows: PendingInvitationRow[] = invitations.map((invitation) => ({
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    status: invitationRowStatus(invitation, now),
    detail: invitationStatusDetail(invitation, now),
    sentLabel: invitation.lastSentAt
      ? `Sent ${date.format(new Date(invitation.lastSentAt))}`
      : `Created ${date.format(new Date(invitation.createdAt))}`,
  }))
  const othersCount = members.filter((member) => member.userId !== viewer.id).length

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Members</h2>
          </CardTitle>
          <CardDescription>
            {members.length === 1 ? "1 person has" : `${members.length} people have`} access to{" "}
            {workspace.name}.
          </CardDescription>
          {canManage ? (
            <CardAction>
              <InviteMemberDialog
                workspaceId={workspace.id}
                workspaceName={workspace.name}
                workspaceType={workspace.type}
              />
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent className="grid gap-4">
          {agency ? (
            <Alert>
              <InfoIcon aria-hidden />
              <AlertDescription>
                Owners and admins of {agency.name} can also manage this client workspace. They
                aren&apos;t listed here.
              </AlertDescription>
            </Alert>
          ) : null}
          {!canManage ? (
            <p className="text-sm text-muted-foreground">
              Only owners and admins can invite people or change roles.
            </p>
          ) : null}
          {members.length > 0 ? (
            <MembersList
              workspaceId={workspace.id}
              workspaceName={workspace.name}
              workspaceType={workspace.type}
              viewer={{ userId: viewer.id, role: workspace.role }}
              members={memberRows}
            />
          ) : null}
          {othersCount === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center">
              <UsersIcon className="size-5 text-muted-foreground" aria-hidden />
              <p className="font-medium">No other members yet</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                {canManage
                  ? "Invite your team to this workspace."
                  : "Owners and admins can invite people to this workspace."}
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Pending invitations</h2>
            </CardTitle>
            <CardDescription>
              Links stay valid for 7 days. Resending sends a new link and stops the old one working.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {invitationRows.length > 0 ? (
              <PendingInvitations workspaceId={workspace.id} invitations={invitationRows} />
            ) : (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center">
                <MailIcon className="size-5 text-muted-foreground" aria-hidden />
                <p className="font-medium">No pending invitations</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Invitations you send will appear here.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
