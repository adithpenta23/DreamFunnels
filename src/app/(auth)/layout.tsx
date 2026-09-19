import type { ReactNode } from "react"
import { Logo } from "@/components/brand/logo"

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main
      id="main"
      className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 p-4"
    >
      <Logo />
      <div className="w-full max-w-sm">{children}</div>
    </main>
  )
}
