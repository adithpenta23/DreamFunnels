"use client"

import { AlertTriangleIcon, RotateCcwIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

type ErrorStateProps = {
  title?: string
  description?: string
  /** Server error digest, shown so users can quote it to support. */
  digest?: string | undefined
  onRetry?: () => void
}

export function ErrorState({
  title = "Something went wrong",
  description = "An unexpected error occurred. Please try again.",
  digest,
  onRetry,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-16 text-center"
    >
      <div className="rounded-full bg-destructive/10 p-3 text-destructive">
        <AlertTriangleIcon className="size-6" aria-hidden />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
        {digest ? (
          <p className="font-mono text-xs text-muted-foreground">Reference: {digest}</p>
        ) : null}
      </div>
      {onRetry ? (
        <Button variant="outline" onClick={onRetry}>
          <RotateCcwIcon aria-hidden />
          Try again
        </Button>
      ) : null}
    </div>
  )
}
