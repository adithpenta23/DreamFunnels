import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { routes } from "@/config/routes"
import { resolveDefaultWorkspace } from "@/features/workspaces/server/queries"

export const metadata: Metadata = { title: "Dashboard" }

/**
 * The post-sign-in landing URL. It has no UI of its own: users without a
 * workspace go to onboarding, everyone else to the workspace they used last
 * on this device (or their oldest one).
 */
export default async function DashboardRedirectPage() {
  const workspace = await resolveDefaultWorkspace()
  redirect(workspace ? routes.workspace(workspace.slug) : routes.onboarding)
}
