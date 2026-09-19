import type { Metadata } from "next"
import Link from "next/link"
import { routes } from "@/config/routes"
import { AuthCard, AuthNotice } from "@/features/auth/components/auth-card"
import { LoginForm } from "@/features/auth/components/login-form"

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false },
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

  return (
    <AuthCard
      title="Welcome back"
      description="Sign in to your DreamFunnels account."
      footer={
        <p>
          New to DreamFunnels?{" "}
          <Link
            href={routes.signup}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Create an account
          </Link>
        </p>
      }
    >
      {notice ? <AuthNotice tone={notice.tone}>{notice.message}</AuthNotice> : null}
      <LoginForm next={typeof next === "string" ? next : undefined} />
    </AuthCard>
  )
}
