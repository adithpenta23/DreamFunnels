import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { routes } from "@/config/routes"
import { getCurrentProfile } from "@/features/account/server/profile"
import {
  PendingInvitationList,
  type PendingInvitationRow,
} from "@/features/invitations/components/pending-invitation-list"
import { listMyPendingInvitations } from "@/features/invitations/server/queries"
import { OnboardingForm } from "@/features/onboarding/components/onboarding-form"
import { getFirstWorkspace } from "@/features/workspaces/server/queries"

export const metadata: Metadata = { title: "Set up your workspace" }

/**
 * First run: shown until the user belongs to a workspace. Invitations waiting
 * for their verified email are listed first (nothing is joined without
 * pressing Accept); without any, the page is the plain setup form.
 */
export default async function OnboardingPage() {
  const [workspace, profile, invitations] = await Promise.all([
    getFirstWorkspace(),
    getCurrentProfile(),
    listMyPendingInvitations(),
  ])
  if (workspace) redirect(routes.dashboard)

  const expires = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: profile.timezone,
  })
  const rows: PendingInvitationRow[] = invitations.map((invitation) => ({
    ...invitation,
    expiresLabel: expires.format(new Date(invitation.expiresAt)),
  }))

  return (
    <div className="grid gap-6">
      {rows.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>
              <h1 className="text-xl font-semibold tracking-tight">You have pending invitations</h1>
            </CardTitle>
            <CardDescription>
              {rows.length === 1
                ? "Someone invited you to their workspace. Accept to join it."
                : "People invited you to their workspaces. Accept the ones you want to join."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PendingInvitationList invitations={rows} askForName={!profile.fullName?.trim()} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Welcome to DreamFunnels
          </p>
          <CardTitle>
            {rows.length > 0 ? (
              <h2 className="text-xl font-semibold tracking-tight">Or set up your own workspace</h2>
            ) : (
              <h1 className="text-xl font-semibold tracking-tight">Set up your workspace</h1>
            )}
          </CardTitle>
          <CardDescription>
            A workspace holds your funnels, leads and settings — usually one per business or brand.
            This takes less than a minute.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OnboardingForm defaultFullName={profile.fullName ?? ""} autoFocus={rows.length === 0} />
        </CardContent>
      </Card>
    </div>
  )
}
