"use client"

import { InfoIcon, TriangleAlertIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useActionState, useState } from "react"
import { FormError, FormField } from "@/components/forms/form-field"
import { SubmitButton } from "@/components/forms/submit-button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/toast"
import { routes } from "@/config/routes"
import { track } from "@/lib/analytics"
import { updateWorkspaceAction, type UpdateWorkspaceState } from "../actions"
import type { WorkspaceSummary } from "../types"
import { WorkspaceUrlInput } from "./workspace-url-input"

type WorkspaceSettingsFormProps = {
  workspace: Pick<WorkspaceSummary, "id" | "name" | "slug">
  /** Owners and admins. Others see the settings read-only (the server enforces it too). */
  canManage: boolean
}

export function WorkspaceSettingsForm({ workspace, canManage }: WorkspaceSettingsFormProps) {
  const router = useRouter()
  const [name, setName] = useState(workspace.name)
  const [slug, setSlug] = useState(workspace.slug)

  const [state, formAction] = useActionState<UpdateWorkspaceState, FormData>(
    async (previous, formData) => {
      const result = await updateWorkspaceAction(previous, formData)
      if (result?.ok) {
        const { slugChanged } = result.data
        track("workspace_updated", { slugChanged })
        toast.success(
          "Workspace updated",
          slugChanged ? { description: "Its URL changed, so update any saved links." } : undefined
        )
        // The old URL no longer exists; move to the new one.
        if (slugChanged) router.replace(routes.workspaceSettings(result.data.slug))
      }
      return result
    },
    null
  )

  const fieldErrors = state && !state.ok ? state.error.fieldErrors : undefined
  const formError = state && !state.ok && !fieldErrors ? state.error.message : undefined
  const slugChanged = slug.trim() !== workspace.slug
  const dirty = name.trim() !== workspace.name || slugChanged

  const reset = () => {
    setName(workspace.name)
    setSlug(workspace.slug)
  }

  return (
    <form action={formAction} className="grid max-w-xl gap-5" noValidate>
      <input type="hidden" name="workspaceId" value={workspace.id} />
      {!canManage ? (
        <Alert>
          <InfoIcon aria-hidden />
          <AlertDescription>
            Only workspace owners and admins can change these settings.
          </AlertDescription>
        </Alert>
      ) : null}
      <FormField id="workspaceName" label="Workspace name" error={fieldErrors?.workspaceName}>
        <Input
          name="workspaceName"
          autoComplete="organization"
          maxLength={80}
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={!canManage}
          required
        />
      </FormField>
      <FormField
        id="workspaceSlug"
        label="Workspace URL"
        hint="Lowercase letters, numbers and hyphens."
        error={fieldErrors?.workspaceSlug}
      >
        <WorkspaceUrlInput
          name="workspaceSlug"
          maxLength={48}
          value={slug}
          onValueChange={setSlug}
          disabled={!canManage}
          required
        />
      </FormField>
      {canManage && slugChanged ? (
        <Alert>
          <TriangleAlertIcon aria-hidden />
          <AlertDescription>
            Changing the URL breaks existing links and bookmarks to this workspace.
          </AlertDescription>
        </Alert>
      ) : null}
      <FormError message={formError} />
      {canManage ? (
        <div className="flex gap-2">
          <SubmitButton disabled={!dirty} pendingLabel="Saving…">
            Save changes
          </SubmitButton>
          {dirty ? (
            <Button type="button" variant="ghost" onClick={reset}>
              Cancel
            </Button>
          ) : null}
        </div>
      ) : null}
    </form>
  )
}
