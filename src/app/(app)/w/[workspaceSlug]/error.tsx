"use client"

import { useEffect } from "react"
import { ErrorState } from "@/components/feedback/error-state"
import { reportError } from "@/lib/monitoring"

/** Errors in workspace pages render inside the shell, so navigation still works. */
export default function WorkspaceError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    // Server errors (with a digest) are already reported by instrumentation.ts.
    if (!error.digest) reportError(error, { boundary: "workspace" })
  }, [error])

  return (
    <ErrorState
      description="We couldn't load this page. Your data is safe — please try again."
      digest={error.digest}
      onRetry={retry}
    />
  )
}
