import type { ReactNode } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

type AuthCardProps = {
  title: string
  description?: ReactNode
  /** Links under the form, e.g. "Don't have an account? Sign up". */
  footer?: ReactNode
  children: ReactNode
}

/** The frame shared by the sign-in, sign-up and password pages. */
export function AuthCard({ title, description, footer, children }: AuthCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="grid gap-4">{children}</CardContent>
      {footer ? (
        <CardFooter className="justify-center text-sm text-muted-foreground">{footer}</CardFooter>
      ) : null}
    </Card>
  )
}

/** A notice at the top of an auth card (expired link, signed out, …). */
export function AuthNotice({
  tone = "info",
  children,
}: {
  tone?: "info" | "error"
  children: ReactNode
}) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={
        tone === "error"
          ? "rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          : "rounded-lg border bg-muted/50 px-3 py-2 text-sm text-muted-foreground"
      }
    >
      {children}
    </p>
  )
}
