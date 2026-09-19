import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { buttonVariants } from "@/components/ui/button"
import { routes } from "@/config/routes"
import { AuthCard } from "@/features/auth/components/auth-card"
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form"
import { getCurrentUser, isRecoverySession } from "@/features/auth/server/session"

export const metadata: Metadata = {
  title: "Choose a new password",
  robots: { index: false },
}

/**
 * Reached from a password-reset email via /auth/callback, which signs the
 * user in with a recovery session. The action re-checks all of this.
 */
export default async function ResetPasswordPage() {
  const user = await getCurrentUser()
  if (!user) redirect(`${routes.forgotPassword}?error=reset_link_invalid`)

  if (!(await isRecoverySession())) {
    // A normal session must use "change password", which asks for the current one.
    return (
      <AuthCard
        title="This reset link has expired"
        description="Reset links work for one hour after you open them. You're still signed in, so you can change your password from your account settings instead."
      >
        <Link href={routes.dashboard} className={buttonVariants({ className: "w-full" })}>
          Go to your dashboard
        </Link>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="Choose a new password"
      description={
        user.email ? (
          <>
            For <strong className="text-foreground">{user.email}</strong>. You&apos;ll stay signed
            in here; other devices will be signed out.
          </>
        ) : undefined
      }
    >
      <ResetPasswordForm />
    </AuthCard>
  )
}
