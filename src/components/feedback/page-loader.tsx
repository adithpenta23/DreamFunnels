import { Loader2Icon } from "lucide-react"

/** Full-area loading indicator for route transitions without a better skeleton. */
export function PageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[50svh] flex-1 flex-col items-center justify-center gap-3 text-sm text-muted-foreground"
    >
      <Loader2Icon className="size-5 animate-spin" aria-hidden />
      <span>{label}</span>
    </div>
  )
}
