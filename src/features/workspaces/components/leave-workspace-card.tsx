"use client"

import { LogOutIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import { ConfirmDialog } from "@/components/feedback/confirm-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "@/components/ui/toast"
import { leaveWorkspaceAction } from "../actions"
import type { LeavePolicy } from "../lib/members"

type LeaveWorkspaceCardProps = {
  workspaceId: string
  workspaceName: string
  /** From leavePolicy(): computed on the server with the database's rules. */
  policy: LeavePolicy
}

/**
 * Settings → General danger zone. Leaving removes the viewer's own
 * membership, then opens another workspace (or onboarding): never the one
 * just left. When leaving isn't allowed (an agency's last owner, or access
 * that only comes from an agency) the button is disabled with the reason.
 */
export function LeaveWorkspaceCard({
  workspaceId,
  workspaceName,
  policy,
}: LeaveWorkspaceCardProps) {
  const router = useRouter()
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const explanationId = "leave-workspace-explanation"

  const leave = async () => {
    const result = await leaveWorkspaceAction({ workspaceId })
    if (!result.ok) return result.error.message
    toast.success(`You left ${workspaceName}`)
    router.push(result.data.destination)
    return null
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle>
          <h2>Leave workspace</h2>
        </CardTitle>
        <CardDescription>
          Remove yourself from {workspaceName}. Your account and your other workspaces aren&apos;t
          affected.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p id={explanationId} className="text-sm text-muted-foreground">
          {policy.canLeave ? policy.impact : policy.explanation}
        </p>
        <div>
          <Button
            ref={trigger}
            variant="destructive"
            disabled={!policy.canLeave}
            aria-describedby={explanationId}
            onClick={() => setOpen(true)}
          >
            <LogOutIcon aria-hidden />
            Leave workspace…
          </Button>
        </div>
      </CardContent>
      {policy.canLeave ? (
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title={`Leave ${workspaceName}?`}
          description={policy.impact}
          confirmLabel="Leave workspace"
          pendingLabel="Leaving…"
          destructive
          onConfirm={leave}
          finalFocus={trigger}
        />
      ) : null}
    </Card>
  )
}
