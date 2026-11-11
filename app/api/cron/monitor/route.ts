import { NextResponse } from 'next/server'
import { runGuardMonitor } from '@/lib/guard-monitor'

export const dynamic = 'force-dynamic'

/** Vercel Cron / external scheduler entry point. Set CRON_SECRET to protect it. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET is not configured.' }, { status: 503 })
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await runGuardMonitor()
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    console.error('[Monitor] Guard monitor failed:', error)
    return NextResponse.json({ ok: false, error: 'Guard monitor failed.' }, { status: 500 })
  }
}
