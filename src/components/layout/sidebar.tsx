import { Logo } from "@/components/brand/logo"
import { routes } from "@/config/routes"
import { WorkspaceSwitcher } from "@/features/workspaces/components/workspace-switcher"
import { AppNav } from "./app-nav"

/** Sidebar content, shared by the desktop sidebar and the mobile sheet. */
export function SidebarContent() {
  return (
    <div className="flex h-full flex-col gap-4">
      <Logo href={routes.dashboard} className="px-2 pt-1" />
      <WorkspaceSwitcher />
      <AppNav />
    </div>
  )
}
