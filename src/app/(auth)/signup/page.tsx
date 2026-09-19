import type { Metadata } from "next"
import Link from "next/link"
import { routes } from "@/config/routes"
import { AuthCard } from "@/features/auth/components/auth-card"
import { SignupForm } from "@/features/auth/components/signup-form"

export const metadata: Metadata = {
  title: "Create your account",
  robots: { index: false },
}

export default function SignupPage() {
  return (
    <AuthCard
      title="Create your account"
      description="Start building funnels in minutes. You'll set up your workspace next."
      footer={
        <p>
          Already have an account?{" "}
          <Link
            href={routes.login}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      }
    >
      <SignupForm />
    </AuthCard>
  )
}
