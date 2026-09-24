import type { Metadata } from "next"
import Link from "next/link"
import { routes } from "@/config/routes"
import { AuthCard, AuthNotice } from "@/features/auth/components/auth-card"
import { SignupForm } from "@/features/auth/components/signup-form"
import { getInvitationPreview } from "@/features/invitations/server/queries"

export const metadata: Metadata = {
  title: "Create your account",
  robots: { index: false },
  // ?invite= carries an invitation token: keep it out of Referer headers.
  referrer: "no-referrer",
}

/**
 * Sign-up. With `?invite=<token>` (from an invitation page) the account is
 * created for the invited address and returns to the invitation; the server
 * re-checks the invitation when the form is submitted.
 */
export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const { invite } = await searchParams
  const token = typeof invite === "string" ? invite : null
  const invitation = token ? await getInvitationPreview(token) : null
  const pendingInvitation = token && invitation?.status === "pending" ? invitation : null

  return (
    <AuthCard
      title={pendingInvitation ? `Join ${pendingInvitation.workspaceName}` : "Create your account"}
      description={
        pendingInvitation
          ? "Create your DreamFunnels account to accept the invitation."
          : "Start building funnels in minutes. You'll set up your workspace next."
      }
      footer={
        <p>
          Already have an account?{" "}
          <Link
            href={
              pendingInvitation && token
                ? `${routes.login}?${new URLSearchParams({ next: routes.invitation(token) })}`
                : routes.login
            }
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      }
    >
      {token && !pendingInvitation ? (
        <AuthNotice tone="error">
          That invitation link is no longer valid. You can still create an account, or ask for a new
          invitation.
        </AuthNotice>
      ) : null}
      <SignupForm
        invitation={
          pendingInvitation && token ? { token, email: pendingInvitation.email } : undefined
        }
      />
    </AuthCard>
  )
}
