import { after, NextResponse } from 'next/server'
import { z } from 'zod'

import { actor, denyGuard, fail } from '@/lib/server'
import {
  cachedOrganization,
  flushSamples,
  pruneOldSamples,
  submitSamples,
  summaryForOrganization,
} from '@/lib/telemetry'
import { isTelemetryWindow, SAMPLE_KINDS, TRACKED_SCREENS, type TelemetrySampleInput } from '@/lib/telemetry-shared'
import { timed } from '@/lib/timing'

export const dynamic = 'force-dynamic'

/** One beacon carries a handful of samples; anything larger is treated as abuse. */
const MAX_SAMPLES = 30
const MAX_STRING = 80

const sampleSchema = z.object({
  kind: z.enum(SAMPLE_KINDS),
  metric: z.string().trim().min(1).max(40),
  value: z.number().finite().min(0).max(600_000),
  screen: z.string().trim().max(MAX_STRING).optional(),
  route: z.string().trim().max(160).optional(),
  rating: z.string().trim().max(20).optional(),
  device: z.string().trim().max(40).optional(),
  navigationType: z.string().trim().max(30).optional(),
})

const bodySchema = z.object({ samples: z.array(sampleSchema).min(1).max(MAX_SAMPLES) })

function normaliseScreen(screen: string | undefined): string | undefined {
  if (!screen) return undefined
  return (TRACKED_SCREENS as readonly string[]).includes(screen) ? screen : 'other'
}

/**
 * Client-side ingest. Deliberately unauthenticated so the guard app can report before a session
 * exists; the organization is attached from the session cookie when one is available.
 *
 * The handler never awaits the database. It validates, enqueues and answers; the write is
 * scheduled with `after()`. When the queue is full it answers 429 instead of dropping samples.
 */
async function handlePost(request: Request) {
  if (process.env.TELEMETRY_DISABLED === 'true') return new NextResponse(null, { status: 204 })

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return fail('Expected a JSON body.')
  }
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) return fail('That telemetry payload is not valid.')

  const samples: TelemetrySampleInput[] = parsed.data.samples.map((sample) => ({
    kind: sample.kind,
    metric: sample.metric,
    value: sample.value,
    screen: normaliseScreen(sample.screen),
    route: sample.kind === 'api' ? (sample.route?.startsWith('/') ? sample.route.slice(0, 160) : '/unknown') : sample.route,
    rating: sample.rating,
    device: sample.device,
    navigationType: sample.navigationType,
  }))

  const organizationId = await cachedOrganization()
  const { accepted, rejected, mode } = await submitSamples(samples, organizationId)

  if (rejected > 0 && accepted === 0) {
    // Explicit backpressure: 503 when the queue is unreachable, 429 when the local buffer is full.
    // Either way the samples are not acknowledged, so the client retries instead of losing them.
    const status = mode === 'redis' ? 503 : 429
    return NextResponse.json(
      { error: mode === 'redis' ? 'Telemetry queue is unavailable. Retry later.' : 'Telemetry buffer is full. Retry later.' },
      { status, headers: mode === 'redis' ? { 'retry-after': '1' } : undefined },
    )
  }

  if (mode === 'memory') {
    after(async () => {
      await flushSamples()
      // ~1% of ingests sweep expired samples, keeping the table bounded without a scheduler.
      if (Math.random() < 0.01) await pruneOldSamples()
    })
  }

  return NextResponse.json({ ok: true, accepted, rejected, mode }, { status: 202 })
}

/** Dashboard data for the active organization. */
async function handleGet(request: Request) {
  const current = await actor()
  if (!current) return fail('Sign in and select an organization to view latency.', 401)
  const denied = denyGuard(current)
  if (denied) return denied

  const requested = new URL(request.url).searchParams.get('window') ?? '24h'
  const range = isTelemetryWindow(requested) ? requested : '24h'
  const summary = await summaryForOrganization(current.organizationId, range)
  return NextResponse.json(summary)
}

export const POST = timed('/api/telemetry', handlePost)
export const GET = timed('/api/telemetry', handleGet)
