"use client"

import { useEffect } from "react"
import { ErrorState } from "@/components/feedback/error-state"
import { reportError } from "@/lib/monitoring"

export default function AuthenticatedError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    // Server errors (with a digest) are already reported by instrumentation.ts.
    if (!error.digest) reportError(error, { boundary: "app" })
  }, [error])

  return (
    <main id="main" className="flex min-h-svh items-center justify-center">
      <ErrorState
        description="We couldn't load this page. Your data is safe — please try again."
        digest={error.digest}
        onRetry={retry}
      />
    </main>
  )
}
