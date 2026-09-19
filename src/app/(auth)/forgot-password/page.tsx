import type { Metadata } from "next"
import Link from "next/link"
import { routes } from "@/config/routes"
import { AuthCard, AuthNotice } from "@/features/auth/components/auth-card"
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form"

export const metadata: Metadata = {
  title: "Reset your password",
  robots: { index: false },
}

const NOTICES: Record<string, string> = {
  reset_link_invalid:
    "That password reset link is invalid or has expired. Request a new one below.",
}

export default async function ForgotPasswordPage({ searchParams }: PageProps<"/forgot-password">) {
  const { error } = await searchParams
  const notice = typeof error === "string" ? NOTICES[error] : undefined

  return (
    <AuthCard
      title="Reset your password"
      description="Enter your account's email and we'll send you a link to choose a new password."
      footer={
        <p>
          Remembered it?{" "}
          <Link
            href={routes.login}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>
        </p>
      }
    >
      {notice ? <AuthNotice tone="error">{notice}</AuthNotice> : null}
      <ForgotPasswordForm />
    </AuthCard>
  )
}
