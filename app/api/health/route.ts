import { NextResponse } from 'next/server'
import { pool } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** Uptime monitors call this. 200 = app and database are reachable. */
export async function GET() {
  try { await pool.query('select 1'); return NextResponse.json({ ok: true, time: new Date().toISOString() }) }
  catch (error) {
    console.error('Health check database query failed:', error)
    return NextResponse.json({ ok: false }, { status: 503 })
  }
}
