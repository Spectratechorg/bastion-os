import { NextResponse } from 'next/server'

import { pool } from '@/lib/db'
import { actor, denyGuard } from '@/lib/server'

export const dynamic = 'force-dynamic'

function databaseProvider(url: string | undefined) {
  if (!url) return 'Not configured'
  if (url.includes('supabase')) return 'Supabase'
  if (url.includes('neon')) return 'Neon'
  if (url.includes('localhost') || url.includes('127.0.0.1')) return 'Local Postgres'
  return 'PostgreSQL'
}

/** Read-only integration status for Settings → System. Never returns credentials or hosts. */
export async function GET() {
  const current = await actor()
  if (!current) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  const denied = denyGuard(current)
  if (denied) return denied

  const started = Date.now()
  let connected = false
  try { await pool.query('select 1'); connected = true } catch { connected = false }
  const latencyMs = Date.now() - started

  return NextResponse.json({
    database: { connected, provider: databaseProvider(process.env.DATABASE_URL), latencyMs },
    auth: { provider: 'Better Auth', emailPassword: true },
    napoleon: { configured: Boolean(process.env.NAPOLEON_API_URL) },
    telemetry: { configured: Boolean(process.env.REDIS_URL) },
  })
}
