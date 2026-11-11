import { NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { sendMail } from '@/lib/email'
import { reportServerError } from '@/lib/observability'

export const dynamic = 'force-dynamic'

/** Vercel Cron health check. Emails OPS_ALERT_EMAIL when the database is unreachable. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET is not configured.' }, { status: 503 })
  if (request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    await pool.query('select 1')
    return NextResponse.json({ ok: true, checkedAt: new Date().toISOString() })
  } catch (error) {
    reportServerError('cron.health', error)
    const to = process.env.OPS_ALERT_EMAIL
    if (to) {
      const result = await sendMail({
        to,
        subject: '[CRITICAL] BastionOS database health check failed',
        text: `The BastionOS database did not respond to its scheduled health check at ${new Date().toISOString()}.\n\nError: ${error instanceof Error ? error.message : String(error)}\n\nOpen the hosting dashboard and Supabase logs immediately.`,
      })
      if (!result.sent) reportServerError('cron.health.email', new Error(result.reason ?? 'Health alert email was not sent.'))
    }
    return NextResponse.json({ ok: false }, { status: 503 })
  }
}
