import { Skeleton } from "@/components/ui/skeleton"

export default function AuditLogLoading() {
  return (
    <div
      className="grid gap-4 rounded-xl border p-6"
      aria-busy="true"
      aria-label="Loading the audit log"
    >
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-9 w-full" />
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton key={index} className="h-10 w-full" />
      ))}
    </div>
  )
}
