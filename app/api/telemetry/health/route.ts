import { NextResponse } from 'next/server'

import { actor, denyGuard, fail } from '@/lib/server'
import { drainSamples, telemetryBufferSnapshot } from '@/lib/telemetry'

export const dynamic = 'force-dynamic'

/**
 * Ingest buffer state for the process serving this request.
 *
 * `?drain=1` flushes the queue first, which is how a load test proves that every accepted sample
 * reached the database. Counters are per process: with several instances each reports its own.
 */
export async function GET(request: Request) {
  const current = await actor()
  if (!current) return fail('Sign in and select an organization to inspect telemetry.', 401)
  const denied = denyGuard(current)
  if (denied) return denied

  const url = new URL(request.url)
  const drained = url.searchParams.get('drain') === '1' ? await drainSamples(10_000) : undefined
  return NextResponse.json({ ...telemetryBufferSnapshot(), drained })
}
