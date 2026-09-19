import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { routes } from "@/config/routes"
import { CreateWorkspaceForm } from "@/features/workspaces/components/create-workspace-form"
import { listMyWorkspaces } from "@/features/workspaces/server/queries"

export const metadata: Metadata = { title: "Create a workspace" }

export default async function NewWorkspacePage() {
  const workspaces = await listMyWorkspaces()
  // The first workspace is created during onboarding, together with the profile.
  if (workspaces.length === 0) redirect(routes.onboarding)

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="text-xl font-semibold tracking-tight">Create a workspace</h1>
        </CardTitle>
        <CardDescription>
          Each workspace keeps its funnels, leads and settings separate — handy for another brand or
          a client. You&apos;ll be its owner.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <CreateWorkspaceForm />
      </CardContent>
      <CardFooter className="justify-center text-sm">
        <Link href={routes.dashboard} className="text-muted-foreground hover:text-foreground">
          Cancel
        </Link>
      </CardFooter>
    </Card>
  )
}
