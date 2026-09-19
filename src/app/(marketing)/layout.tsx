import type { ReactNode } from "react"
import Link from "next/link"
import { Logo } from "@/components/brand/logo"
import { buttonVariants } from "@/components/ui/button"
import { routes } from "@/config/routes"
import { siteConfig } from "@/config/site"

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Logo />
          <nav aria-label="Account" className="flex items-center gap-2">
            <Link href={routes.login} className={buttonVariants({ variant: "ghost" })}>
              Sign in
            </Link>
            <Link href={routes.signup} className={buttonVariants()}>
              Get started
            </Link>
          </nav>
        </div>
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
      <footer className="border-t">
        <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-muted-foreground">
          © {new Date().getFullYear()} {siteConfig.name}
        </div>
      </footer>
    </div>
  )
}
