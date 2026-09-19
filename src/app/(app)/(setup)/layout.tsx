import type { ReactNode } from "react"
import { Logo } from "@/components/brand/logo"
import { Button } from "@/components/ui/button"
import { routes } from "@/config/routes"
import { signOut } from "@/features/auth/actions"
import { requireUser } from "@/features/auth/server/session"

/**
 * Focused, shell-less pages for signed-in users outside a workspace
 * (onboarding, creating a workspace). Always offers a way to sign out, in
 * case someone signed up with the wrong address.
 */
export default async function SetupLayout({ children }: { children: ReactNode }) {
  const user = await requireUser()

  return (
    <div className="flex min-h-svh flex-col bg-muted/40">
      <header className="flex h-14 items-center justify-between gap-4 px-4 md:px-6">
        <Logo href={routes.dashboard} />
        <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
          {user.email ? (
            <span className="hidden truncate sm:inline">Signed in as {user.email}</span>
          ) : null}
          <form action={signOut}>
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <main id="main" className="flex flex-1 items-start justify-center px-4 pt-6 pb-16 md:pt-16">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  )
}
