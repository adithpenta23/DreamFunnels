import { PageLoader } from "@/components/feedback/page-loader"

export default function AuthenticatedLoading() {
  return (
    <main id="main" className="flex min-h-svh flex-col">
      <PageLoader />
    </main>
  )
}
