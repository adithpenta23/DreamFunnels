import { SearchXIcon } from "lucide-react"
import Link from "next/link"
import { EmptyState } from "@/components/feedback/empty-state"
import { buttonVariants } from "@/components/ui/button"
import { routes } from "@/config/routes"

/**
 * Rendered when the workspace layout can't open a workspace. Deliberately
 * identical for "doesn't exist" and "not a member", so workspace existence
 * is never leaked to outsiders.
 */
export default function WorkspaceNotFound() {
  return (
    <main id="main" className="flex min-h-svh items-center justify-center p-4">
      <div className="w-full max-w-md">
        <EmptyState
          icon={SearchXIcon}
          title="Workspace not found"
          description="It doesn't exist, or you don't have access to it. If someone shared this link, ask them to invite you."
          action={
            <Link href={routes.dashboard} className={buttonVariants({ variant: "outline" })}>
              Go to your dashboard
            </Link>
          }
        />
      </div>
    </main>
  )
}
