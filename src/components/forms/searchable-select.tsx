"use client"

import { Combobox } from "@base-ui/react/combobox"
import { cn } from "cn"
import { CheckIcon, ChevronsUpDownIcon, XIcon } from "lucide-react"
import { useMemo } from "react"

export type SelectOption = {
  value: string
  label: string
  /** Secondary line in the list (e.g. "America/Chicago · GMT-6"). */
  description?: string
  /** Extra text matched by search but not shown. */
  keywords?: string
}

type SearchableSelectProps = {
  /** Set by FormField: labels the input. */
  id?: string
  /** Form field name; the selected option's value is submitted under it. */
  name: string
  options: readonly SelectOption[]
  value: string | null
  onValueChange: (value: string | null) => void
  placeholder?: string
  emptyMessage?: string
  /** Show a clear button (for optional fields). */
  clearable?: boolean
  disabled?: boolean
  "aria-invalid"?: boolean
  "aria-describedby"?: string
}

/** Case-, accent- and underscore-insensitive: "sao paulo" finds "America/Sao_Paulo". */
const normalize = (text: string) =>
  text.normalize("NFKD").replace(/[̀-ͯ]/g, "").replaceAll("_", " ").toLowerCase()

/**
 * A select whose options can be searched by typing (Base UI Combobox). Keyboard:
 * type to filter, arrows to move, Enter to pick, Escape to close. Every word
 * typed must match the label, description or keywords.
 */
export function SearchableSelect({
  id,
  name,
  options,
  value,
  onValueChange,
  placeholder,
  emptyMessage = "No matches.",
  clearable = false,
  disabled = false,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: SearchableSelectProps) {
  const items = useMemo(
    () =>
      Combobox.createItems(options, {
        getValue: (option) => option.value,
        getLabel: (option) => option.label,
      }),
    [options]
  )
  const searchText = useMemo(
    () =>
      new Map(
        options.map((option) => [
          option.value,
          normalize(`${option.label} ${option.description ?? ""} ${option.keywords ?? ""}`),
        ])
      ),
    [options]
  )

  return (
    <Combobox.Root
      items={items}
      name={name}
      value={value}
      onValueChange={(next) => onValueChange(next ?? null)}
      disabled={disabled}
      autoHighlight
      filter={(option: SelectOption, query) => {
        const words = normalize(query).split(/\s+/).filter(Boolean)
        const haystack = searchText.get(option.value) ?? ""
        return words.every((word) => haystack.includes(word))
      }}
    >
      <Combobox.InputGroup className="relative">
        <Combobox.Input
          id={id}
          placeholder={placeholder}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
          className={cn(
            "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent py-1 pr-14 pl-2.5 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80",
            !clearable && "pr-8"
          )}
        />
        <div className="absolute inset-y-0 right-1 flex items-center text-muted-foreground">
          {clearable && value ? (
            <Combobox.Clear
              aria-label="Clear selection"
              className="grid size-6 place-items-center rounded-md hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <XIcon className="size-3.5" aria-hidden />
            </Combobox.Clear>
          ) : null}
          <Combobox.Trigger
            aria-label="Show options"
            className="grid size-6 place-items-center rounded-md hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none"
          >
            <ChevronsUpDownIcon className="size-4" aria-hidden />
          </Combobox.Trigger>
        </div>
      </Combobox.InputGroup>

      <Combobox.Portal>
        <Combobox.Positioner className="isolate z-50 outline-none" sideOffset={4}>
          <Combobox.Popup className="w-(--anchor-width) max-w-(--available-width) origin-(--transform-origin) overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
            <Combobox.Empty className="px-3 py-2.5 text-sm text-muted-foreground empty:hidden">
              {emptyMessage}
            </Combobox.Empty>
            <Combobox.List className="max-h-[min(20rem,var(--available-height))] scroll-py-1 overflow-y-auto overscroll-contain p-1 outline-none data-empty:p-0">
              {(option: SelectOption) => (
                <Combobox.Item
                  key={option.value}
                  value={option.value}
                  className="grid cursor-default grid-cols-[1rem_1fr] items-start gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                >
                  <Combobox.ItemIndicator className="col-start-1 mt-0.5">
                    <CheckIcon className="size-4" aria-hidden />
                  </Combobox.ItemIndicator>
                  <span className="col-start-2 grid min-w-0">
                    <span className="truncate">{option.label}</span>
                    {option.description ? (
                      <span className="truncate text-xs text-muted-foreground">
                        {option.description}
                      </span>
                    ) : null}
                  </span>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  )
}
