import { Skeleton } from "@/components/ui/skeleton"

export default function SettingsLoading() {
  return (
    <div className="grid gap-6" aria-busy="true" aria-label="Loading">
      {Array.from({ length: 2 }, (_, index) => (
        <Skeleton key={index} className="h-56 rounded-xl" />
      ))}
    </div>
  )
}
