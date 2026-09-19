"use client"

import { MenuIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { useUIStore } from "@/stores/ui-store"
import { SidebarContent } from "./sidebar"

export function MobileNav() {
  const open = useUIStore((state) => state.mobileNavOpen)
  const setOpen = useUIStore((state) => state.setMobileNavOpen)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation" />
        }
      >
        <MenuIcon />
      </SheetTrigger>
      <SheetContent side="left" className="w-72 bg-sidebar p-3">
        <SheetHeader className="sr-only">
          <SheetTitle>Navigation</SheetTitle>
          <SheetDescription>Switch workspace or go to another section.</SheetDescription>
        </SheetHeader>
        <SidebarContent />
      </SheetContent>
    </Sheet>
  )
}
