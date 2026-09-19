import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

type ControlProps = {
  id?: string
  "aria-invalid"?: boolean
  "aria-describedby"?: string
}

type FormFieldProps = {
  /** The control's id; also the base for the hint and error ids. */
  id: string
  label: ReactNode
  /** Help text under the control. */
  hint?: ReactNode
  /** Validation message(s); only the first is shown. */
  error?: string[] | string | undefined
  /** Rendered on the label's row, right-aligned (e.g. "Forgot password?"). */
  labelAction?: ReactNode
  className?: string
  /** A single input-like element. Its id and ARIA wiring are filled in. */
  children: ReactElement<ControlProps>
}

/**
 * Label + control + hint + error, wired for assistive tech: the control gets
 * `aria-invalid` and `aria-describedby` pointing at the hint and the error, so
 * screen readers announce why a field was rejected.
 */
export function FormField({
  id,
  label,
  hint,
  error,
  labelAction,
  className,
  children,
}: FormFieldProps) {
  const message = Array.isArray(error) ? error[0] : error
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = message ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined

  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        "aria-invalid": message ? true : undefined,
        "aria-describedby": describedBy,
      })
    : children

  return (
    <div className={cn("grid gap-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {labelAction}
      </div>
      {control}
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {message ? (
        <p id={errorId} className="text-sm text-destructive">
          {message}
        </p>
      ) : null}
    </div>
  )
}

/** A form-level error (not tied to one field), announced when it appears. */
export function FormError({ message }: { message: string | undefined }) {
  if (!message) return null
  return (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  )
}
