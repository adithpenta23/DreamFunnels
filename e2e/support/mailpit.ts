import { expect } from "@playwright/test"

/**
 * Reads what the app "sent" from Mailpit, the mail catcher in the local
 * Supabase stack (and in CI). Nothing leaves the machine: the app's email
 * provider is Mailpit whenever EMAIL_PROVIDER isn't set to resend.
 */

const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324"

type MailpitSummary = { ID: string; Subject: string; To: { Address: string }[] }

export type CapturedEmail = {
  id: string
  subject: string
  to: string[]
  text: string
  html: string
}

async function mailpit<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(new URL(path, MAILPIT_URL), init)
  if (!response.ok) throw new Error(`Mailpit ${path} answered ${response.status}`)
  return (await response.json()) as T
}

async function search(to: string): Promise<MailpitSummary[]> {
  const query = new URLSearchParams({ query: `to:"${to}"` })
  const { messages } = await mailpit<{ messages: MailpitSummary[] | null }>(
    `/api/v1/search?${query}`
  )
  return messages ?? []
}

/**
 * Waits for the next email to `to` (newest first) whose subject matches, and
 * returns it in full. `after` skips messages already seen (e.g. before a resend).
 */
export async function waitForEmail(
  to: string,
  options: { subject?: RegExp; after?: readonly string[] } = {}
): Promise<CapturedEmail> {
  let found: MailpitSummary | undefined
  await expect(async () => {
    const messages = await search(to)
    found = messages.find(
      (message) =>
        !options.after?.includes(message.ID) &&
        (!options.subject || options.subject.test(message.Subject))
    )
    expect(found, `an email to ${to}`).toBeDefined()
  }).toPass({ timeout: 15_000 })

  const message = await mailpit<{
    ID: string
    Subject: string
    To: { Address: string }[]
    Text: string
    HTML: string
  }>(`/api/v1/message/${found!.ID}`)
  return {
    id: message.ID,
    subject: message.Subject,
    to: message.To.map((recipient) => recipient.Address),
    text: message.Text,
    html: message.HTML,
  }
}

/** Ids of every email to `to` so far. */
export async function emailIdsTo(to: string): Promise<string[]> {
  return (await search(to)).map((message) => message.ID)
}

/** The invitation link in an email, as a path on the app ("/invite/<token>"). */
export function invitationPathFrom(email: CapturedEmail): string {
  const match = /https?:\/\/[^\s"<>]+\/invite\/([A-Za-z0-9_-]{43})/.exec(email.text)
  if (!match?.[1]) throw new Error(`No invitation link in "${email.subject}"`)
  return `/invite/${match[1]}`
}

/** Deletes captured emails (best effort; the local Mailpit is disposable). */
export async function deleteEmails(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return
  await fetch(new URL("/api/v1/messages", MAILPIT_URL), {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ IDs: ids }),
  }).catch(() => undefined)
}

/**
 * The Supabase Auth link in an email (confirmation, recovery), as a path on
 * the app ("/auth/callback?token_hash=…&type=…&next=…"). The templates build
 * it from the project's Site URL; only the path and query matter here.
 */
export function authCallbackPathFrom(email: CapturedEmail): string {
  const match = /https?:\/\/[^\s"'<>]+?(\/auth\/callback\?[^\s"'<>]+)/.exec(
    `${email.text}\n${email.html}`
  )
  if (!match?.[1]) throw new Error(`No auth link in "${email.subject}"`)
  return match[1].replace(/&amp;/g, "&")
}
