import type { Metadata } from "next"
import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"
import { routes } from "@/config/routes"
import { getCurrentProfile } from "@/features/account/server/profile"
import { AuthCard, AuthNotice } from "@/features/auth/components/auth-card"
import { getCurrentUser } from "@/features/auth/server/session"
import { AcceptInvitationForm } from "@/features/invitations/components/accept-invitation-form"
import { InvitationDetails } from "@/features/invitations/components/invitation-details"
import { SwitchAccountButton } from "@/features/invitations/components/switch-account-button"
import { getInvitationPreview } from "@/features/invitations/server/queries"

/**
 * The page an invitation email links to. Public (the invitee may have no
 * account yet), but it shows only what the token's holder should see, and
 * nothing at all for a malformed, unknown or random token.
 *
 * Always rendered per request: its content depends on the token and on who's
 * signed in, so it must never be cached or prerendered. The token stays out
 * of the Referer header, and the page out of search engines.
 */
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Invitation",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

const linkClass = "font-medium text-foreground underline-offset-4 hover:underline"

export default async function InvitationPage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params
  const [invitation, user] = await Promise.all([getInvitationPreview(token), getCurrentUser()])

  if (!invitation) {
    return (
      <AuthCard
        title="This invitation link isn't valid"
        description="Check that you copied the whole link from the email. If it still doesn't work, ask the person who invited you to send a new invitation."
        footer={<SignedInFooter signedIn={user !== null} />}
      >
        <AuthNotice>
          Invitation links are long; email apps sometimes break them across lines.
        </AuthNotice>
      </AuthCard>
    )
  }

  if (invitation.status === "expired") {
    return (
      <AuthCard
        title="This invitation has expired"
        description={`Invitations work for 7 days. Ask ${invitation.inviterName ?? "an admin"} or another admin of ${invitation.workspaceName} to send a new one.`}
        footer={<SignedInFooter signedIn={user !== null} />}
      >
        <InvitationDetails invitation={invitation} />
      </AuthCard>
    )
  }

  if (invitation.status === "revoked") {
    return (
      <AuthCard
        title="This invitation was cancelled"
        description={`An admin of ${invitation.workspaceName} cancelled it, so the link no longer works. If you still need access, ask them for a new invitation.`}
        footer={<SignedInFooter signedIn={user !== null} />}
      >
        <InvitationDetails invitation={invitation} />
      </AuthCard>
    )
  }

  if (invitation.status === "accepted") {
    return invitation.workspaceSlug ? (
      <AuthCard
        title={`You've joined ${invitation.workspaceName}`}
        description="You accepted this invitation already."
      >
        <Link
          href={routes.workspace(invitation.workspaceSlug)}
          className={buttonVariants({ size: "lg", className: "w-full" })}
        >
          Open {invitation.workspaceName}
        </Link>
      </AuthCard>
    ) : (
      <AuthCard
        title="This invitation has already been used"
        description="Each invitation link works once. If it was yours, sign in to open the workspace."
        footer={<SignedInFooter signedIn={user !== null} />}
      >
        {user ? null : (
          <Link href={routes.login} className={buttonVariants({ size: "lg", className: "w-full" })}>
            Sign in
          </Link>
        )}
      </AuthCard>
    )
  }

  // Pending.
  const invitationPath = routes.invitation(token)
  const intro = `${invitation.inviterName ?? "An admin"} invited you to join as ${
    invitation.role === "admin" ? "an admin" : "a member"
  }.`

  if (!user) {
    return (
      <AuthCard title={`You're invited to join ${invitation.workspaceName}`} description={intro}>
        <InvitationDetails invitation={invitation} />
        <p className="text-sm text-muted-foreground">
          Sign in or create your account with{" "}
          <strong className="text-foreground">{invitation.email}</strong>. The invitation only works
          for that address.
        </p>
        <div className="grid gap-2">
          <Link
            href={`${routes.login}?${new URLSearchParams({ next: invitationPath })}`}
            className={buttonVariants({ size: "lg", className: "w-full" })}
          >
            Sign in to accept
          </Link>
          <Link
            href={`${routes.signup}?${new URLSearchParams({ invite: token })}`}
            className={buttonVariants({ variant: "outline", size: "lg", className: "w-full" })}
          >
            Create an account
          </Link>
        </div>
      </AuthCard>
    )
  }

  if (user.email?.toLowerCase() !== invitation.email) {
    return (
      <AuthCard
        title="This invitation is for a different account"
        description={`It was sent to ${invitation.email}, but you're signed in as ${user.email ?? "another account"}.`}
        footer={
          <Link href={routes.dashboard} className={linkClass}>
            Go to my workspaces instead
          </Link>
        }
      >
        <InvitationDetails invitation={invitation} />
        <p className="text-sm text-muted-foreground">
          To accept it, sign out and continue as {invitation.email}. You&apos;ll come straight back
          here.
        </p>
        <SwitchAccountButton token={token} />
      </AuthCard>
    )
  }

  const profile = await getCurrentProfile()
  return (
    <AuthCard
      title={`Join ${invitation.workspaceName}`}
      description={intro}
      footer={<p>Signed in as {user.email}.</p>}
    >
      <InvitationDetails invitation={invitation} />
      <AcceptInvitationForm
        token={token}
        workspaceName={invitation.workspaceName}
        askForName={!profile.fullName?.trim()}
      />
    </AuthCard>
  )
}

function SignedInFooter({ signedIn }: { signedIn: boolean }) {
  return signedIn ? (
    <Link href={routes.dashboard} className={linkClass}>
      Go to my workspaces
    </Link>
  ) : (
    <p>
      Already have access?{" "}
      <Link href={routes.login} className={linkClass}>
        Sign in
      </Link>
    </p>
  )
}
