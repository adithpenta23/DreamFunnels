"use client"

import { useState } from "react"
import { FormField } from "@/components/forms/form-field"
import { Input } from "@/components/ui/input"
import type { FieldErrors } from "@/lib/action-result"
import { suggestWorkspaceSlug } from "../lib/slug"
import { WorkspaceUrlInput } from "./workspace-url-input"

/**
 * Name + optional URL for a new workspace, with a live preview of the URL the
 * database will generate when it's left blank. Used by onboarding and
 * "Create workspace".
 */
export function NewWorkspaceFields({
  errors,
  autoFocus = false,
}: {
  errors?: FieldErrors | undefined
  autoFocus?: boolean
}) {
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const suggestion = suggestWorkspaceSlug(name)

  const slugHint =
    slug.trim() !== ""
      ? "Lowercase letters, numbers and hyphens. You can change it later."
      : suggestion
        ? `Leave blank to use “${suggestion}” (we'll add a few characters if it's taken).`
        : "Leave blank and we'll create one from the workspace name."

  return (
    <>
      <FormField
        id="workspaceName"
        label="Workspace name"
        hint="Usually your company or brand. You can change it later."
        error={errors?.workspaceName}
      >
        <Input
          name="workspaceName"
          autoComplete="organization"
          placeholder="Acme Inc."
          maxLength={80}
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          autoFocus={autoFocus}
        />
      </FormField>
      <FormField
        id="workspaceSlug"
        label={
          <>
            Workspace URL <span className="font-normal text-muted-foreground">(optional)</span>
          </>
        }
        hint={slugHint}
        error={errors?.workspaceSlug}
      >
        <WorkspaceUrlInput
          name="workspaceSlug"
          placeholder={suggestion ?? "acme-inc"}
          maxLength={48}
          value={slug}
          onValueChange={setSlug}
        />
      </FormField>
    </>
  )
}
