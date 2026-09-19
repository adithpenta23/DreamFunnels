"use client"

import { useEffect } from "react"
import { reportError } from "@/lib/monitoring"

/**
 * Last-resort boundary for errors in the root layout itself. It replaces the
 * whole document, so it can't rely on globals.css — keep it dependency-free.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    if (!error.digest) reportError(error, { boundary: "global" })
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "grid",
          placeItems: "center",
          minHeight: "100vh",
          margin: 0,
          textAlign: "center",
        }}
      >
        <title>Something went wrong</title>
        <div>
          <h1 style={{ fontSize: "1.25rem" }}>Something went wrong</h1>
          <p style={{ color: "#666" }}>
            Please try again. If the problem persists, contact support.
          </p>
          {error.digest ? (
            <p style={{ color: "#666", fontFamily: "monospace", fontSize: "0.75rem" }}>
              Reference: {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => retry()}
            style={{ padding: "0.5rem 1rem", cursor: "pointer" }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
