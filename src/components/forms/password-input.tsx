"use client"

import { EyeIcon, EyeOffIcon } from "lucide-react"
import { useState, type ComponentProps } from "react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type PasswordInputProps = Omit<ComponentProps<typeof Input>, "type">

/** A password input with a show/hide toggle. */
export function PasswordInput({ className, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        // Browsers must not offer to save or correct a revealed password.
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className={cn("pr-9", className)}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        disabled={props.disabled}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-lg text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
      >
        {visible ? (
          <EyeOffIcon className="size-4" aria-hidden />
        ) : (
          <EyeIcon className="size-4" aria-hidden />
        )}
      </button>
    </div>
  )
}
