"use client"

import { CheckIcon, CopyIcon } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/toast"

/** A read-only value with a copy button (ids, keys to quote to support). */
export function CopyField({ id, value, label }: { id: string; value: string; label: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      toast.success(`${label} copied`)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Couldn't copy to the clipboard", { description: "Select the text and copy it." })
    }
  }

  return (
    <div className="flex gap-2">
      <Input id={id} value={value} readOnly className="font-mono text-xs md:text-xs" />
      <Button
        type="button"
        variant="outline"
        onClick={copy}
        aria-label={`Copy ${label.toLowerCase()}`}
      >
        {copied ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  )
}
