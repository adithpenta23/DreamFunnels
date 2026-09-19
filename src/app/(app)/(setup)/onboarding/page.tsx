import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { routes } from "@/config/routes"
import { getCurrentProfile } from "@/features/account/server/profile"
import { OnboardingForm } from "@/features/onboarding/components/onboarding-form"
import { listMyWorkspaces } from "@/features/workspaces/server/queries"

export const metadata: Metadata = { title: "Set up your workspace" }

/** First run: shown until the user belongs to a workspace. */
export default async function OnboardingPage() {
  const [workspaces, profile] = await Promise.all([listMyWorkspaces(), getCurrentProfile()])
  if (workspaces.length > 0) redirect(routes.dashboard)

  return (
    <Card>
      <CardHeader>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Welcome to DreamFunnels
        </p>
        <CardTitle>
          <h1 className="text-xl font-semibold tracking-tight">Set up your workspace</h1>
        </CardTitle>
        <CardDescription>
          A workspace holds your funnels, leads and settings — usually one per business or brand.
          This takes less than a minute.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <OnboardingForm defaultFullName={profile.fullName ?? ""} />
      </CardContent>
    </Card>
  )
}
