"use client"

import { Toast } from "@base-ui/react/toast"
import { CircleAlertIcon, CircleCheckIcon, InfoIcon, XIcon } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "cn"

/**
 * App-wide toasts on Base UI's Toast (already a dependency, so no toast
 * library). `<Toaster />` is mounted once in the root layout; anything can
 * call `toast.success(...)`, and toasts survive client-side navigation.
 */

const toastManager = Toast.createToastManager()

type ToastType = "success" | "error" | "info"
type ToastOptions = { description?: ReactNode; timeout?: number }

function show(type: ToastType, title: ReactNode, options: ToastOptions = {}) {
  return toastManager.add({
    type,
    title,
    description: options.description,
    timeout: options.timeout,
    // Errors are announced assertively; everything else politely.
    priority: type === "error" ? "high" : "low",
  })
}

export const toast = {
  success: (title: ReactNode, options?: ToastOptions) => show("success", title, options),
  error: (title: ReactNode, options?: ToastOptions) => show("error", title, options),
  info: (title: ReactNode, options?: ToastOptions) => show("info", title, options),
  dismiss: (id?: string) => toastManager.close(id),
}

const ICONS: Record<ToastType, typeof InfoIcon> = {
  success: CircleCheckIcon,
  error: CircleAlertIcon,
  info: InfoIcon,
}

export function Toaster() {
  return (
    <Toast.Provider toastManager={toastManager} limit={3}>
      <Toast.Portal>
        <Toast.Viewport className="fixed right-4 bottom-4 z-100 w-[calc(100vw-2rem)] outline-none sm:w-90">
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  )
}

function ToastList() {
  const { toasts } = Toast.useToastManager()

  return toasts.map((item) => {
    const Icon = ICONS[(item.type as ToastType | undefined) ?? "info"] ?? InfoIcon
    return (
      <Toast.Root
        key={item.id}
        toast={item}
        data-slot="toast"
        className={cn(
          "absolute right-0 bottom-0 w-full origin-bottom rounded-xl bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/10 select-none",
          "[--gap:0.75rem] [--peek:0.5rem] [--scale:calc(max(0,1-(var(--toast-index)*0.1)))] [--shrink:calc(1-var(--scale))]",
          "z-[calc(1000-var(--toast-index))] h-(--toast-frontmost-height,var(--toast-height))",
          "transform-[translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)-(var(--toast-index)*var(--peek))-(var(--shrink)*var(--toast-frontmost-height,var(--toast-height)))))_scale(var(--scale))]",
          "transition-[transform,opacity,height] duration-300 ease-out",
          "data-expanded:h-(--toast-height) data-expanded:transform-[translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-offset-y)*-1+var(--toast-index)*var(--gap)*-1+var(--toast-swipe-movement-y)))]",
          "data-ending-style:opacity-0 data-limited:opacity-0 data-starting-style:translate-y-[150%]",
          "after:absolute after:top-full after:left-0 after:h-[calc(var(--gap)+1px)] after:w-full after:content-['']"
        )}
      >
        <Toast.Content className="flex items-start gap-3 overflow-hidden p-3 transition-opacity data-behind:opacity-0 data-expanded:opacity-100">
          <Icon
            aria-hidden
            className={cn(
              "mt-0.5 size-4 shrink-0",
              item.type === "success" && "text-emerald-600 dark:text-emerald-400",
              item.type === "error" && "text-destructive",
              item.type === "info" && "text-muted-foreground"
            )}
          />
          <div className="min-w-0 flex-1 space-y-0.5">
            <Toast.Title className="text-sm font-medium" />
            <Toast.Description className="text-sm text-muted-foreground" />
          </div>
          <Toast.Close
            aria-label="Dismiss notification"
            className="-m-1 rounded-md p-1 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <XIcon className="size-4" aria-hidden />
          </Toast.Close>
        </Toast.Content>
      </Toast.Root>
    )
  })
}
