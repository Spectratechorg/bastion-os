import { NextResponse } from 'next/server'

import { actor, denyGuard, fail } from '@/lib/server'
import { drainSamples, telemetryQueueSnapshot } from '@/lib/telemetry'

export const dynamic = 'force-dynamic'

/**
 * Delivery-path state: the Redis stream when configured, otherwise the in-process buffer.
 *
 * `?drain=1` flushes the local buffer (memory mode), which is how a load test proves that every
 * accepted sample reached the database. In Redis mode the worker owns the write, so the stream
 * length and pending count are reported instead; drain only reports that it was skipped.
 */
export async function GET(request: Request) {
  const current = await actor()
  if (!current) return fail('Sign in and select an organization to inspect telemetry.', 401)
  const denied = denyGuard(current)
  if (denied) return denied

  const url = new URL(request.url)
  const snapshot = await telemetryQueueSnapshot()
  const drained = url.searchParams.get('drain') === '1'
    ? (snapshot.mode === 'memory' ? await drainSamples(10_000) : false)
    : undefined
  return NextResponse.json({ ...snapshot, drained })
}
