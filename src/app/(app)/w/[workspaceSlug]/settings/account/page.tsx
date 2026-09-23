import type { Metadata } from "next"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ProfileForm } from "@/features/account/components/profile-form"
import { getCurrentProfile } from "@/features/account/server/profile"
import { ChangePasswordForm } from "@/features/auth/components/change-password-form"
import { requireWorkspaceMember } from "@/features/workspaces/server/queries"
import { timezoneOptions } from "@/lib/timezones"

export const metadata: Metadata = { title: "Account settings" }

/** Personal settings. They're the same in every workspace; the URL just keeps the shell. */
export default async function AccountSettingsPage({
  params,
}: PageProps<"/w/[workspaceSlug]/settings/account">) {
  const { workspaceSlug } = await params
  const [, profile] = await Promise.all([
    requireWorkspaceMember(workspaceSlug),
    getCurrentProfile(),
  ])

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Profile</h2>
          </CardTitle>
          <CardDescription>
            How you appear to people in your workspaces, and how we reach you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm key={profile.id} profile={profile} timezoneOptions={timezoneOptions()} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Password</h2>
          </CardTitle>
          <CardDescription>
            Change the password you sign in with. Your other devices will be signed out.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  )
}
