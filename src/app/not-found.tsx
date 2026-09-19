import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"
import { routes } from "@/config/routes"

export default function NotFound() {
  return (
    <main
      id="main"
      className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center"
    >
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist or has moved.
      </p>
      <Link href={routes.home} className={buttonVariants({ variant: "outline" })}>
        Back to home
      </Link>
    </main>
  )
}
