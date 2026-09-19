"use client"

import { useEffect } from "react"
import { ErrorState } from "@/components/feedback/error-state"
import { reportError } from "@/lib/monitoring"

export default function RootError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    // Server errors (with a digest) are already reported by instrumentation.ts.
    if (!error.digest) reportError(error, { boundary: "root" })
  }, [error])

  return (
    <main id="main" className="flex flex-1 items-center justify-center">
      <ErrorState digest={error.digest} onRetry={retry} />
    </main>
  )
}
