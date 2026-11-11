import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

export type Mail = { to: string; subject: string; text: string; html?: string }
export type MailResult = { sent: boolean; transport: 'resend' | 'outbox' | 'none'; reason?: string }

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] ?? character))
const appUrl = () => (process.env.BETTER_AUTH_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const titleCase = (value: string) => value ? value.charAt(0).toUpperCase() + value.slice(1) : value
const severityTone = (severity: string) => {
  const value = severity.toLowerCase()
  if (value === 'critical') return { background: '#FDE7E4', text: '#A9362B', border: '#F3CBC5' }
  if (value === 'high') return { background: '#FDF1EF', text: '#B4483B', border: '#F2DDD8' }
  if (value === 'medium') return { background: '#FBF5E9', text: '#8A6413', border: '#EFE2C7' }
  return { background: '#EFF5EF', text: '#2F6B49', border: '#DCE8DC' }
}

function layout(input: { preheader: string; eyebrow: string; title: string; content: string; footer?: string }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(input.title)}</title></head>
<body style="margin:0;padding:0;background:#F4F4F2;font-family:'Public Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#18181B;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F4F4F2;"><tr><td align="center" style="padding:32px 14px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#FFFFFF;border:1px solid #E4E4E7;border-radius:14px;overflow:hidden;">
<tr><td style="background:#1E1F22;padding:22px 28px;">
  <span style="display:inline-block;color:#FFFFFF;font-size:18px;font-weight:700;letter-spacing:-0.3px;">BastionOS</span>
  <span style="display:inline-block;margin-left:8px;color:#9A9AA1;font-size:9px;font-weight:600;letter-spacing:1.4px;text-transform:uppercase;vertical-align:middle;">Security operations</span>
</td></tr>
<tr><td style="padding:30px 28px 26px;">
  <p style="margin:0 0 8px;color:#8A938B;font-size:10px;font-weight:700;letter-spacing:1.3px;text-transform:uppercase;">${escapeHtml(input.eyebrow)}</p>
  <h1 style="margin:0 0 18px;color:#18181B;font-size:25px;line-height:1.2;letter-spacing:-0.5px;font-weight:650;">${escapeHtml(input.title)}</h1>
  ${input.content}
</td></tr>
<tr><td style="padding:18px 28px 22px;background:#FAFAF8;border-top:1px solid #EFEFF1;color:#8A938B;font-size:11px;line-height:1.6;">
  ${input.footer ?? 'You are receiving this because you are an owner, administrator or moderator for this BastionOS organization.'}<br>
  <span style="color:#A1A1AA;">BastionOS · Secure operations workspace</span>
</td></tr>
</table>
</td></tr></table></body></html>`
}

const button = (href: string, label: string, tone = '#1E1F22') => `<a href="${escapeHtml(href)}" style="display:inline-block;margin-top:22px;background:${tone};color:#FFFFFF;text-decoration:none;padding:12px 19px;border-radius:8px;font-size:13px;font-weight:600;">${escapeHtml(label)}</a>`
const paragraph = (value: string) => `<p style="margin:0 0 14px;color:#3F3F46;font-size:14px;line-height:1.7;">${escapeHtml(value)}</p>`
const detailTable = (rows: [string, string][]) => `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:18px 0 4px;background:#FAFAF8;border:1px solid #EFEFF1;border-radius:10px;"><tr><td style="padding:4px 14px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${rows.map(([label, value]) => `<tr><td style="padding:9px 0;color:#8A938B;font-size:11px;border-bottom:1px solid #EFEFF1;">${escapeHtml(label)}</td><td align="right" style="padding:9px 0;color:#3F3F46;font-size:12px;font-weight:600;border-bottom:1px solid #EFEFF1;">${escapeHtml(value)}</td></tr>`).join('')}</table></td></tr></table>`

export function mailConfigured(): boolean {
  return Boolean(process.env.MAIL_OUTBOX_DIR || (process.env.RESEND_API_KEY && process.env.MAIL_FROM))
}

/** Sends transactional mail through Resend, or a local outbox for development. */
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
        '--- HTML ---',
        mail.html ?? '',
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
      body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
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

export function credentialsEmail(input: { name: string; email: string; password: string; organization: string }): Mail {
  const signIn = `${appUrl()}/sign-in`
  return {
    to: input.email,
    subject: `Your BastionOS account for ${input.organization}`,
    text: [`Hello ${input.name},`, '', `${input.organization} created a BastionOS account for you.`, '', `Sign in: ${signIn}`, `Email: ${input.email}`, `Temporary password: ${input.password}`, '', 'Change the password after signing in: Profile → Change password.', '', '— BastionOS'].join('\n'),
    html: layout({
      preheader: `Your BastionOS account for ${input.organization}`,
      eyebrow: 'Account ready',
      title: `Welcome to ${input.organization}`,
      content: `${paragraph(`Hello ${input.name},`)}${paragraph(`${input.organization} created a BastionOS account for you. Use the credentials below to sign in.`)}${detailTable([['Email', input.email], ['Temporary password', input.password], ['Workspace', input.organization]])}${button(signIn, 'Sign in to BastionOS')}${paragraph('Change the password after signing in from Profile → Change password. If you were not expecting this account, contact your administrator.')}`,
      footer: 'This account was created by your organization. Contact your administrator if you were not expecting it.',
    }),
  }
}

export function alertEmail(input: { to: string; severity: string; title: string; body: string }): Mail {
  const tone = severityTone(input.severity)
  return {
    to: input.to,
    subject: `[${input.severity.toUpperCase()}] ${input.title} · BastionOS`,
    text: [input.title, '', input.body, '', `Severity: ${input.severity}`, `Open BastionOS: ${appUrl()}/alerts`, '', '— BastionOS'].join('\n'),
    html: layout({
      preheader: input.body,
      eyebrow: 'Operational alert',
      title: input.title,
      content: `<span style="display:inline-block;margin-bottom:16px;padding:5px 9px;border-radius:999px;background:${tone.background};border:1px solid ${tone.border};color:${tone.text};font-size:10px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;">${escapeHtml(input.severity)} severity</span>${paragraph(input.body)}${button(`${appUrl()}/alerts`, 'Open alerts')}`,
    }),
  }
}

export function incidentEmail(input: { to: string; title: string; description: string; site: string; severity: string; status: string }): Mail {
  const tone = severityTone(input.severity)
  return {
    to: input.to,
    subject: `[${input.severity.toUpperCase()} INCIDENT] ${input.title} · BastionOS`,
    text: [input.title, '', input.description, '', `Site: ${input.site}`, `Severity: ${input.severity}`, `Status: ${input.status}`, `Open in BastionOS: ${appUrl()}/incidents`, '', '— BastionOS'].join('\n'),
    html: layout({
      preheader: `${input.title} · ${input.site}`,
      eyebrow: 'Incident reported',
      title: input.title,
      content: `<span style="display:inline-block;margin-bottom:16px;padding:5px 9px;border-radius:999px;background:${tone.background};border:1px solid ${tone.border};color:${tone.text};font-size:10px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;">${escapeHtml(input.severity)} · ${escapeHtml(input.status)}</span>${paragraph(input.description)}${detailTable([['Site', input.site], ['Severity', titleCase(input.severity)], ['Status', titleCase(input.status)]])}${button(`${appUrl()}/incidents`, 'Open incident register')}`,
    }),
  }
}

export function attendanceEmail(input: { to: string; guard: string; site: string | null; message: string; deadline?: string }): Mail {
  return {
    to: input.to,
    subject: `[ATTENDANCE] ${input.guard} · BastionOS`,
    text: [input.message, '', `Guard: ${input.guard}`, `Site: ${input.site ?? 'Unassigned'}`, ...(input.deadline ? [`Deadline: ${input.deadline}`] : []), `Open attendance: ${appUrl()}/attendance`, '', '— BastionOS'].join('\n'),
    html: layout({
      preheader: `${input.guard} · ${input.message}`,
      eyebrow: 'Attendance exception',
      title: input.guard,
      content: `${paragraph(input.message)}${detailTable([['Guard', input.guard], ['Site', input.site ?? 'Unassigned'], ...(input.deadline ? [['Deadline', input.deadline] as [string, string]] : [])])}${button(`${appUrl()}/attendance`, 'Open attendance', '#A9362B')}`,
    }),
  }
}
