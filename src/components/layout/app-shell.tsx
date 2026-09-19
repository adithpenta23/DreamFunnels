import type { ReactNode } from "react"
import { MobileNav } from "./mobile-nav"
import { SidebarContent } from "./sidebar"
import { UserMenu } from "./user-menu"

/**
 * Chrome for workspace pages: sidebar on desktop, sheet on mobile, header
 * with the account menu. Reads user and workspace from the app context, so it
 * must render inside AppContextProvider (see app/(app)/w/[workspaceSlug]/layout.tsx).
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh">
      <aside className="sticky top-0 hidden h-svh w-64 shrink-0 border-r bg-sidebar p-3 md:block">
        <SidebarContent />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-backdrop-filter:bg-background/80">
          <MobileNav />
          <div className="ml-auto">
            <UserMenu />
          </div>
        </header>
        <main id="main" className="flex-1 px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  )
}
