import type { Metadata } from "next"
import Link from "next/link"
import { routes } from "@/config/routes"
import { AuthCard, AuthNotice } from "@/features/auth/components/auth-card"
import { LoginForm } from "@/features/auth/components/login-form"
import { invitationTokenFromPath } from "@/features/invitations/lib/tokens"

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false },
  // ?next= can carry an invitation link: keep it out of Referer headers.
  referrer: "no-referrer",
}

// Keys come from the URL, so only known ones render (never echo the param).
const NOTICES: Record<string, { tone: "info" | "error"; message: string }> = {
  auth_callback_failed: {
    tone: "error",
    message:
      "That link is invalid or has expired. If you were confirming your email, try signing in — otherwise request a new link.",
  },
  session_expired: {
    tone: "info",
    message: "Your session has ended. Please sign in again.",
  },
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error, reason } = await searchParams
  const key = typeof error === "string" ? error : typeof reason === "string" ? reason : undefined
  const notice = key ? NOTICES[key] : undefined
  // Signing in to accept an invitation: say so, and keep the invitation if
  // they need an account instead.
  const invitationToken = invitationTokenFromPath(typeof next === "string" ? next : null)

  return (
    <AuthCard
      title="Welcome back"
      description="Sign in to your DreamFunnels account."
      footer={
        <p>
          New to DreamFunnels?{" "}
          <Link
            href={
              invitationToken
                ? `${routes.signup}?${new URLSearchParams({ invite: invitationToken })}`
                : routes.signup
            }
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Create an account
          </Link>
        </p>
      }
    >
      {notice ? <AuthNotice tone={notice.tone}>{notice.message}</AuthNotice> : null}
      {invitationToken && !notice ? (
        <AuthNotice>
          Sign in with the email address your invitation was sent to. You&apos;ll go straight back
          to it.
        </AuthNotice>
      ) : null}
      <LoginForm next={typeof next === "string" ? next : undefined} />
    </AuthCard>
  )
}
