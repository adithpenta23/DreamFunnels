"use client"

import Script from "next/script"
import { useEffect, useRef, useState } from "react"
import { CAPTCHA_FIELD, TURNSTILE_SCRIPT_URL, type CaptchaAction } from "@/lib/captcha/shared"
import { publicEnv } from "@/lib/env/public"

type TurnstileRenderOptions = {
  sitekey: string
  action: CaptchaAction
  theme: "auto" | "light" | "dark"
  size: "normal" | "flexible" | "compact"
  "response-field-name": string
  callback: (token: string) => void
  "expired-callback": () => void
  "error-callback": () => void
}

type TurnstileApi = {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string
  reset: (widgetId: string) => void
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

/** The public site key; null means CAPTCHA is off (local development without keys). */
export const captchaSiteKey = (): string | null => publicEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null

type TurnstileWidgetProps = {
  action: CaptchaAction
  /** Receives the token when solved, and null when it expires or is spent. */
  onTokenChange: (token: string | null) => void
  /** Changes after every submission: the token was spent, so get a new one. */
  resetKey?: unknown
  siteKey?: string | null
}

/**
 * Cloudflare Turnstile inside a form. The widget writes its token into a
 * hidden `cf-turnstile-response` input, so the Server Action receives it with
 * the rest of the FormData and verifies it server-side. Renders nothing when
 * no site key is configured.
 */
export function TurnstileWidget({
  action,
  onTokenChange,
  resetKey,
  siteKey = captchaSiteKey(),
}: TurnstileWidgetProps) {
  const container = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)
  const onTokenChangeRef = useRef(onTokenChange)
  const [scriptReady, setScriptReady] = useState(
    () => typeof window !== "undefined" && Boolean(window.turnstile)
  )

  useEffect(() => {
    onTokenChangeRef.current = onTokenChange
  })

  useEffect(() => {
    const api = window.turnstile
    if (!siteKey || !scriptReady || !api || !container.current) return
    const id = api.render(container.current, {
      sitekey: siteKey,
      action,
      theme: "auto",
      size: "flexible",
      "response-field-name": CAPTCHA_FIELD,
      callback: (token) => onTokenChangeRef.current(token),
      "expired-callback": () => onTokenChangeRef.current(null),
      "error-callback": () => onTokenChangeRef.current(null),
    })
    widgetId.current = id
    return () => {
      api.remove(id)
      widgetId.current = null
    }
  }, [siteKey, scriptReady, action])

  const previousResetKey = useRef(resetKey)
  useEffect(() => {
    if (Object.is(previousResetKey.current, resetKey)) return
    previousResetKey.current = resetKey
    if (widgetId.current) {
      window.turnstile?.reset(widgetId.current)
      onTokenChangeRef.current(null)
    }
  }, [resetKey])

  if (!siteKey) return null

  return (
    <>
      <Script
        src={TURNSTILE_SCRIPT_URL}
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
      />
      {/* Reserve the widget's height so the form doesn't jump when it appears. */}
      <div ref={container} className="min-h-[65px]" />
    </>
  )
}
