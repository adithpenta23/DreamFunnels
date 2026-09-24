"use client"

import { cn } from "@/lib/utils"
import { ASSIGNABLE_MEMBER_ROLES, roleDescription, type AssignableMemberRole } from "../lib/members"
import { WORKSPACE_ROLE_LABELS } from "../lib/roles"
import type { WorkspaceType } from "../types"

type RoleOptionsProps = {
  /** Form field name; the chosen role is submitted under it. */
  name: string
  value: AssignableMemberRole
  onValueChange: (role: AssignableMemberRole) => void
  workspaceType: WorkspaceType
  legend?: string
  error?: string[] | undefined
  disabled?: boolean
}

/**
 * Member or admin, each with what it means here. Native radio inputs in a
 * fieldset: arrow keys move between them, and they submit with the form.
 * Owner is deliberately absent (ownership isn't handed out from this UI).
 */
export function RoleOptions({
  name,
  value,
  onValueChange,
  workspaceType,
  legend = "Role",
  error,
  disabled = false,
}: RoleOptionsProps) {
  const message = error?.[0]
  const errorId = message ? `${name}-error` : undefined

  return (
    <fieldset className="grid gap-2" aria-describedby={errorId} disabled={disabled}>
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      {ASSIGNABLE_MEMBER_ROLES.map((role) => {
        const id = `${name}-${role}`
        const checked = value === role
        return (
          <label
            key={role}
            htmlFor={id}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
              checked ? "border-foreground/40 bg-muted/60" : "hover:bg-muted/40",
              disabled && "cursor-not-allowed opacity-60"
            )}
          >
            <input
              id={id}
              type="radio"
              name={name}
              value={role}
              checked={checked}
              onChange={() => onValueChange(role)}
              aria-describedby={`${id}-description`}
              className="mt-0.5 size-4 accent-foreground"
            />
            <span className="grid gap-0.5">
              <span className="font-medium">{WORKSPACE_ROLE_LABELS[role]}</span>
              <span id={`${id}-description`} className="text-muted-foreground">
                {roleDescription(role, workspaceType)}
              </span>
            </span>
          </label>
        )
      })}
      {message ? (
        <p id={errorId} className="text-sm text-destructive">
          {message}
        </p>
      ) : null}
    </fieldset>
  )
}
