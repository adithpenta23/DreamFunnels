import { SparklesIcon } from "lucide-react"
import Link from "next/link"
import type { Route } from "next"
import { siteConfig } from "@/config/site"
import { cn } from "@/lib/utils"

type LogoProps = {
  href?: Route
  className?: string
}

export function Logo({ href = "/", className }: LogoProps) {
  return (
    <Link
      href={href}
      className={cn("flex items-center gap-2 font-semibold tracking-tight", className)}
    >
      <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground">
        <SparklesIcon className="size-4" aria-hidden />
      </span>
      {siteConfig.name}
    </Link>
  )
}
