"use client"

import { useTransition } from "react"
import { Button } from "@/components/ui/button"
import { routes } from "@/config/routes"
import { signOutAndReturn } from "@/features/auth/actions"
import { resetAnalytics } from "@/lib/analytics"

/**
 * Signed in to the wrong account for an invitation: sign out here (this
 * browser only) and come straight back to the invitation, where the invited
 * person can sign in or create their account. Nothing switches silently.
 */
export function SwitchAccountButton({ token }: { token: string }) {
  const [pending, startTransition] = useTransition()

  return (
    <Button
      className="w-full"
      size="lg"
      disabled={pending}
      aria-busy={pending}
      onClick={() =>
        startTransition(async () => {
          resetAnalytics()
          await signOutAndReturn(routes.invitation(token))
        })
      }
    >
      {pending ? "Signing out…" : "Sign out and continue"}
    </Button>
  )
}
