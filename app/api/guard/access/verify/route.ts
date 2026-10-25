import { NextResponse } from 'next/server'
import { organizationForGuardAppCode } from '@/lib/guard-access'

export const dynamic = 'force-dynamic'

/** Codes are shared by every guard phone, so keep guessing cheap and slow. */
const attempts = new Map<string, { count: number; resetAt: number }>()

function throttled(key: string) {
  const now = Date.now()
  const entry = attempts.get(key)
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + 60_000 })
    return false
  }
  entry.count += 1
  return entry.count > 12
}

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: 'Database is not configured.' }, { status: 503 })
  const key = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
  if (throttled(key)) return NextResponse.json({ error: 'Too many attempts. Wait a minute and try again.' }, { status: 429 })

  const body = await request.json().catch(() => null) as { code?: unknown } | null
  const code = typeof body?.code === 'string' ? body.code : ''
  if (!code.trim()) return NextResponse.json({ error: 'Enter the company guard app code.' }, { status: 400 })

  const organization = await organizationForGuardAppCode(code)
  if (!organization) return NextResponse.json({ error: 'That code does not match any company. Check it with your supervisor.' }, { status: 401 })
  return NextResponse.json({ ok: true, organizationName: organization.name })
}
