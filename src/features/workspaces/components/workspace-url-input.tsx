"use client"

import type { ChangeEvent, ComponentProps } from "react"
import { publicEnv } from "@/lib/env/public"
import { cn } from "@/lib/utils"

const URL_PREFIX = `${new URL(publicEnv.NEXT_PUBLIC_APP_URL).host}/w/`

/** Friendly typing: lowercase, and spaces/underscores become hyphens. */
export function normalizeSlugInput(value: string): string {
  return value.toLowerCase().replace(/[\s_]+/g, "-")
}

type WorkspaceUrlInputProps = Omit<ComponentProps<"input">, "value" | "onChange" | "type"> & {
  value: string
  onValueChange: (value: string) => void
}

/** A slug input shown as part of the full workspace URL. */
export function WorkspaceUrlInput({
  value,
  onValueChange,
  className,
  disabled,
  ...props
}: WorkspaceUrlInputProps) {
  return (
    <div
      className={cn(
        "flex h-8 w-full min-w-0 items-center overflow-hidden rounded-lg border border-input text-base transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 has-aria-invalid:border-destructive has-aria-invalid:ring-3 has-aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30",
        disabled && "cursor-not-allowed bg-input/50 opacity-50",
        className
      )}
    >
      <span
        aria-hidden
        className="flex h-full shrink-0 items-center border-r bg-muted/50 px-2.5 text-muted-foreground select-none"
      >
        {URL_PREFIX}
      </span>
      <input
        {...props}
        type="text"
        value={value}
        disabled={disabled}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          onValueChange(normalizeSlugInput(event.target.value))
        }
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className="h-full min-w-0 flex-1 bg-transparent px-2.5 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
      />
    </div>
  )
}
