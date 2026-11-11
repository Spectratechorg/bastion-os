import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

export type Mail = { to: string; subject: string; text: string }
export type MailResult = { sent: boolean; transport: 'resend' | 'outbox' | 'none'; reason?: string }

export function mailConfigured(): boolean {
  return Boolean(process.env.MAIL_OUTBOX_DIR || (process.env.RESEND_API_KEY && process.env.MAIL_FROM))
}

/**
 * Sends transactional mail. Resend is used when configured; a local outbox directory can capture
 * messages during development/testing. Without either, this returns sent: false so the caller can
 * tell the administrator to hand the credentials over directly.
 */
export async function sendMail(mail: Mail): Promise<MailResult> {
  const outbox = process.env.MAIL_OUTBOX_DIR
  if (outbox) {
    try {
      await mkdir(outbox, { recursive: true })
      const file = join(outbox, `${Date.now()}-${randomUUID().slice(0, 8)}.eml`)
      const safe = (value: string) => value.replace(/[\r\n]+/g, ' ')
      await writeFile(file, [
        `To: ${safe(mail.to)}`,
        `From: ${safe(process.env.MAIL_FROM ?? 'BastionOS <no-reply@bastion.local>')}`,
        `Subject: ${safe(mail.subject)}`,
        'Content-Type: text/plain; charset=utf-8',
        '',
        mail.text,
        '',
      ].join('\n'), { mode: 0o600 })
      return { sent: true, transport: 'outbox' }
    } catch (error) {
      return { sent: false, transport: 'outbox', reason: error instanceof Error ? error.message : 'Could not write the outbox file.' }
    }
  }

  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.MAIL_FROM
  if (!apiKey || !from) return { sent: false, transport: 'none', reason: 'Email is not configured.' }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text }),
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      return { sent: false, transport: 'resend', reason: `Resend rejected the message (${response.status})${detail ? `: ${detail.slice(0, 160)}` : ''}` }
    }
    return { sent: true, transport: 'resend' }
  } catch (error) {
    return { sent: false, transport: 'resend', reason: error instanceof Error ? error.message : 'Could not reach the email service.' }
  }
}

/** The message a new administrator/moderator receives with their first credentials. */
export function credentialsEmail(input: { name: string; email: string; password: string; organization: string }): Mail {
  const appUrl = (process.env.BETTER_AUTH_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  return {
    to: input.email,
    subject: `Your BastionOS account for ${input.organization}`,
    text: [
      `Hello ${input.name},`,
      '',
      `${input.organization} created a BastionOS account for you.`,
      '',
      `Sign in: ${appUrl}/sign-in`,
      `Email: ${input.email}`,
      `Temporary password: ${input.password}`,
      '',
      'Change the password after signing in: open Profile and use “Change password”.',
      'If you were not expecting this, contact your administrator.',
      '',
      '— BastionOS',
    ].join('\n'),
  }
}


/** Operational alert notification for owners, administrators and moderators. */
export function alertEmail(input: { to: string; severity: string; title: string; body: string }): Mail {
  const appUrl = (process.env.BETTER_AUTH_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  return {
    to: input.to,
    subject: `[${input.severity.toUpperCase()}] ${input.title} · BastionOS`,
    text: [
      input.title,
      '',
      input.body,
      '',
      `Severity: ${input.severity}`,
      `Open BastionOS: ${appUrl}/alerts`,
      '',
      'You are receiving this because you are an owner, administrator or moderator for this organization.',
      '— BastionOS',
    ].join('\n'),
  }
}
