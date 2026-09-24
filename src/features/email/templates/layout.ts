/**
 * Building blocks for transactional email HTML. Templates are version-controlled
 * code rendered from trusted application data; every interpolated value goes
 * through `escapeHtml` (or `safeUrl` for links), so a workspace called
 * `<script>` is shown, never run. No tenant-authored HTML is ever inserted.
 */

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character)
}

/** An http(s) URL, escaped for an attribute. Anything else is a programming error. */
export function safeUrl(value: string): string {
  const url = new URL(value)
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Email links must be http(s)")
  }
  return escapeHtml(url.toString())
}

const COLORS = {
  text: "#0a0a0a",
  muted: "#525252",
  border: "#e5e5e5",
  surface: "#fafafa",
  button: "#171717",
  buttonText: "#ffffff",
} as const

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

/** A button-styled link that works in Outlook, Gmail and Apple Mail. */
export function button(label: string, href: string): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0">
  <tr>
    <td style="border-radius:8px;background:${COLORS.button}">
      <a href="${safeUrl(href)}" style="display:inline-block;padding:12px 20px;font-family:${FONT};font-size:15px;font-weight:600;color:${COLORS.buttonText};text-decoration:none;border-radius:8px">${escapeHtml(label)}</a>
    </td>
  </tr>
</table>`
}

/** A quoted note from a person (e.g. an invitation message). Line breaks are kept. */
export function quote(text: string, attribution: string): string {
  return `<div style="margin:16px 0;padding:12px 16px;border-left:3px solid ${COLORS.border};background:${COLORS.surface};color:${COLORS.text};white-space:pre-line">${escapeHtml(text)}<div style="margin-top:8px;color:${COLORS.muted};font-size:13px">— ${escapeHtml(attribution)}</div></div>`
}

type LayoutOptions = {
  /** The <title> and heading. Plain text. */
  title: string
  /** Inbox preview text (hidden in the body). Plain text. */
  preheader: string
  /** Already-escaped HTML for the main content. */
  body: string
  /** Already-escaped HTML for the small print under the content. */
  footer: string
}

/** The shared frame: a single centred column, readable on phones and in dark mode clients. */
export function layout({ title, preheader, body, footer }: LayoutOptions): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#ffffff">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
  <tr>
    <td align="center" style="padding:32px 16px">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:520px">
        <tr>
          <td style="font-family:${FONT};font-size:15px;line-height:1.6;color:${COLORS.text}">
            <p style="margin:0 0 24px;font-size:14px;font-weight:700;letter-spacing:-0.01em">DreamFunnels</p>
            <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:600">${escapeHtml(title)}</h1>
            ${body}
            <hr style="margin:32px 0 16px;border:none;border-top:1px solid ${COLORS.border}">
            <div style="font-size:13px;color:${COLORS.muted}">${footer}</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`
}

export const paragraph = (html: string) => `<p style="margin:0 0 12px">${html}</p>`
export const strong = (text: string) => `<strong>${escapeHtml(text)}</strong>`
