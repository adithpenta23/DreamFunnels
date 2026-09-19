import { PageLoader } from "@/components/feedback/page-loader"

export default function DashboardLoading() {
  return (
    <main id="main" className="flex min-h-svh flex-col">
      <PageLoader label="Opening your workspace…" />
    </main>
  )
}
