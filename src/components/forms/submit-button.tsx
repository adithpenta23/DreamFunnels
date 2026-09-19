"use client"

import { Loader2Icon } from "lucide-react"
import type { ComponentProps } from "react"
import { useFormStatus } from "react-dom"
import { Button } from "@/components/ui/button"

type SubmitButtonProps = Omit<ComponentProps<typeof Button>, "type"> & {
  /** Label shown while the form is submitting. */
  pendingLabel?: string
}

/** A submit button that disables itself and shows a spinner while its form is pending. */
export function SubmitButton({ children, pendingLabel, disabled, ...props }: SubmitButtonProps) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" disabled={pending || disabled} aria-busy={pending} {...props}>
      {pending ? <Loader2Icon className="animate-spin" aria-hidden /> : null}
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  )
}
