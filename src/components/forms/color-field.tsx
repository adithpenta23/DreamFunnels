"use client"

import { XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const HEX_COLOR = /^#[0-9a-f]{6}$/i

type ColorFieldProps = {
  /** Set by FormField: labels the text input. */
  id?: string
  name: string
  /** "#rrggbb" or "" for none. */
  value: string
  onValueChange: (value: string) => void
  /** Used in the buttons' accessible names: "Pick <colorName>", "Clear <colorName>". */
  colorName: string
  disabled?: boolean
  "aria-invalid"?: boolean
  "aria-describedby"?: string
}

/**
 * A hex color: type it, or pick it from the browser's native picker behind
 * the swatch. Empty means "no color set" (a native color input can't be empty,
 * which is why the text field is the source of truth).
 */
export function ColorField({
  id,
  name,
  value,
  onValueChange,
  colorName,
  disabled = false,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: ColorFieldProps) {
  const valid = HEX_COLOR.test(value)

  return (
    <div className="flex items-center gap-2">
      <span
        className="relative size-8 shrink-0 overflow-hidden rounded-lg border border-input bg-[repeating-conic-gradient(var(--muted)_0_25%,transparent_0_50%)] bg-size-[8px_8px] focus-within:ring-3 focus-within:ring-ring/50"
        style={valid ? { background: value } : undefined}
      >
        <input
          type="color"
          aria-label={`Pick ${colorName}`}
          value={valid ? value.toLowerCase() : "#000000"}
          onChange={(event) => onValueChange(event.target.value)}
          disabled={disabled}
          className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
      </span>
      <Input
        id={id}
        name={name}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder="#RRGGBB"
        maxLength={7}
        spellCheck={false}
        autoComplete="off"
        disabled={disabled}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        className="font-mono uppercase placeholder:normal-case"
      />
      {value && !disabled ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Clear ${colorName}`}
          onClick={() => onValueChange("")}
        >
          <XIcon aria-hidden />
        </Button>
      ) : null}
    </div>
  )
}
