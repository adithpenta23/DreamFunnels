import { z } from "zod"
import { isSupportedTimezone } from "@/lib/timezones"
import { button, escapeHtml, layout, paragraph, quote, strong } from "./layout"

/**
 * "You're invited to join <workspace>". Rendered from trusted application
 * data; the variables are validated first, so a missing value fails the send
 * instead of producing "undefined" or an empty link.
 */

export const invitationEmailVariables = z.object({
  invitedEmail: z.email(),
  workspaceName: z.string().trim().min(1).max(120),
  /** The inviter's name, or their email when they haven't set one. */
  inviterName: z.string().trim().min(1).max(254),
  role: z.enum(["member", "admin"]),
  /** Built from NEXT_PUBLIC_APP_URL, never from request headers. */
  acceptUrl: z.url({ protocol: /^https?$/ }),
  expiresAt: z.date(),
  /** The workspace's IANA time zone, for the expiry date. */
  timeZone: z.string().refine(isSupportedTimezone),
  /** Optional note from the inviter (plain text). */
  message: z.string().trim().max(500).nullish(),
})

export type InvitationEmailVariables = z.input<typeof invitationEmailVariables>

const ROLE_PHRASES = { member: "a member", admin: "an admin" } as const

export function renderInvitationEmail(variables: z.output<typeof invitationEmailVariables>) {
  const { invitedEmail, workspaceName, inviterName, role, acceptUrl, message } = variables
  const expires = new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeZone: variables.timeZone,
  }).format(variables.expiresAt)
  const rolePhrase = ROLE_PHRASES[role]

  const subject = `${inviterName} invited you to join ${workspaceName} on DreamFunnels`
  const title = `Join ${workspaceName} on DreamFunnels`

  const html = layout({
    title,
    preheader: `Accept the invitation to join ${workspaceName} as ${rolePhrase}.`,
    body: [
      paragraph(
        `${strong(inviterName)} invited you to join ${strong(workspaceName)} as ${rolePhrase}.`
      ),
      message ? quote(message, inviterName) : "",
      button("Accept invitation", acceptUrl),
      paragraph(`This invitation expires on ${strong(expires)}.`),
    ].join("\n"),
    footer: [
      `This invitation was sent to ${escapeHtml(invitedEmail)}. Sign in or create an account with this address to accept it.`,
      "If you weren't expecting it, you can ignore this email.",
      `Button not working? Copy this link into your browser:<br><span style="word-break:break-all">${escapeHtml(acceptUrl)}</span>`,
    ]
      .map((line) => `<p style="margin:0 0 8px">${line}</p>`)
      .join(""),
  })

  const text = [
    title,
    "",
    `${inviterName} invited you to join ${workspaceName} as ${rolePhrase}.`,
    ...(message
      ? ["", ...message.split("\n").map((line) => `> ${line}`), `> — ${inviterName}`]
      : []),
    "",
    `Accept the invitation: ${acceptUrl}`,
    "",
    `This invitation expires on ${expires}.`,
    `It was sent to ${invitedEmail}. Sign in or create an account with this address to accept it.`,
    "If you weren't expecting it, you can ignore this email.",
  ].join("\n")

  return { subject, html, text }
}
