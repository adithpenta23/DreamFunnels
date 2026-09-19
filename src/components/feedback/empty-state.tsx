import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

type EmptyStateProps = {
  icon: LucideIcon
  title: string
  description: string
  action?: ReactNode
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center">
      <div className="rounded-full bg-muted p-3 text-muted-foreground">
        <Icon className="size-6" aria-hidden />
      </div>
      <div className="space-y-1">
        <h2 className="font-semibold">{title}</h2>
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  )
}
