import { SearchXIcon } from "lucide-react"
import Link from "next/link"
import { EmptyState } from "@/components/feedback/empty-state"
import { buttonVariants } from "@/components/ui/button"
import { routes } from "@/config/routes"

/**
 * notFound() from a page inside an open workspace (e.g. access revoked
 * between navigations). Keeps the shell; same wording as ../not-found.tsx.
 */
export default function WorkspacePageNotFound() {
  return (
    <EmptyState
      icon={SearchXIcon}
      title="Workspace not found"
      description="It doesn't exist, or you don't have access to it."
      action={
        <Link href={routes.dashboard} className={buttonVariants({ variant: "outline" })}>
          Go to your dashboard
        </Link>
      }
    />
  )
}
