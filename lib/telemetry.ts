import { createHash } from 'node:crypto'
import { headers } from 'next/headers'
import { and, desc, eq, gte, lt } from 'drizzle-orm'

import { getActiveOrganization } from '@/lib/auth/organization'
import { db } from '@/lib/db'
import { telemetrySamples } from '@/lib/db/schema'
import { endpointBudget, screenBudget, TELEMETRY_BASELINE } from '@/lib/telemetry-baseline'
import { createSampleBuffer, type BufferedSample } from '@/lib/telemetry-buffer'
import {
  percentile,
  WINDOW_HOURS,
  type SummaryRow,
  type TelemetrySampleInput,
  type TelemetrySummary,
  type TelemetryWindow,
} from '@/lib/telemetry-shared'

export type { BufferSnapshot, EnqueueResult } from '@/lib/telemetry-buffer'

const buffer = createSampleBuffer(async (batch) => {
  if (!process.env.DATABASE_URL) return
  await db.insert(telemetrySamples).values(batch.map((sample) => ({
    organizationId: sample.organizationId,
    kind: sample.kind,
    screen: sample.screen ?? null,
    route: sample.route ?? null,
    metric: sample.metric,
    value: sample.value,
    rating: sample.rating ?? null,
    device: sample.device ?? null,
    navigationType: sample.navigationType ?? null,
    createdAt: new Date(),
  })))
})

/**
 * Flushes independently of any request. Request-scoped flushes are only a nudge: if a request's
 * async context is torn down mid-write, this timer still drains the queue on the next tick.
 * Guarded per process so dev hot-reload cannot stack intervals.
 */
const globalForTelemetry = globalThis as typeof globalThis & { __bastionTelemetryFlusher?: ReturnType<typeof setInterval> }
if (!globalForTelemetry.__bastionTelemetryFlusher && typeof setInterval === 'function') {
  const timer = setInterval(() => { void buffer.flush() }, 25)
  timer.unref?.()
  globalForTelemetry.__bastionTelemetryFlusher = timer
}

/**
 * Resolves the active organization for the current request, cached per session cookie for a minute.
 * Telemetry must not pay for two database round-trips on every beacon; the cache keeps attribution
 * correct without putting session lookups on the ingest critical path.
 *
 * The cache key is a hash of the cookie, never the cookie itself.
 */
const organizationCache = new Map<string, { organizationId: string | null; expiresAt: number }>()
const ORGANIZATION_CACHE_MS = 60_000
const ORGANIZATION_CACHE_MAX = 500

export async function cachedOrganization(): Promise<string | null> {
  let cookie = ''
  try {
    cookie = (await headers()).get('cookie') ?? ''
  } catch {
    return null
  }
  if (!cookie) return null

  const key = createHash('sha256').update(cookie).digest('base64url').slice(0, 32)
  const hit = organizationCache.get(key)
  if (hit && hit.expiresAt > Date.now()) return hit.organizationId

  let organizationId: string | null = null
  try {
    organizationId = (await getActiveOrganization())?.organizationId ?? null
  } catch {
    organizationId = null
  }
  if (organizationCache.size >= ORGANIZATION_CACHE_MAX) organizationCache.clear()
  organizationCache.set(key, { organizationId, expiresAt: Date.now() + ORGANIZATION_CACHE_MS })
  return organizationId
}

/** Enqueues samples without touching the database. Returns how many were accepted. */
export function enqueueSamples(samples: TelemetrySampleInput[], organizationId: string | null) {
  const rows: BufferedSample[] = samples.map((sample) => ({ ...sample, organizationId }))
  return buffer.enqueue(rows)
}

/** Writes everything currently queued. Scheduled with `after()` so it runs past the response. */
export function flushSamples(): Promise<void> {
  return buffer.flush()
}

/** Flushes until empty or the deadline passes; used by the load test and by health checks. */
export function drainSamples(timeoutMs?: number): Promise<boolean> {
  return buffer.drain(timeoutMs)
}

export function telemetryBufferSnapshot() {
  return buffer.snapshot()
}

/**
 * Records an API handler duration. Called from `after()`, so it can afford to resolve the
 * organization from the session; the response has already been sent.
 */
export async function recordServerSample(route: string, durationMs: number, status: number): Promise<void> {
  const organizationId = await cachedOrganization()
  enqueueSamples([{
    kind: 'api',
    route,
    metric: 'api',
    value: Math.max(0, durationMs),
    rating: status >= 500 ? 'error' : status >= 400 ? 'warn' : 'ok',
  }], organizationId)
  await flushSamples()
}

/** Drops samples older than `maxAgeDays`. Called opportunistically so the table cannot grow forever. */
export async function pruneOldSamples(maxAgeDays = 30): Promise<void> {
  if (!process.env.DATABASE_URL) return
  try {
    await db.delete(telemetrySamples).where(lt(telemetrySamples.createdAt, new Date(Date.now() - maxAgeDays * 86_400_000)))
  } catch {
    // Best-effort housekeeping.
  }
}

function summarizeGroup(key: string, metric: string, values: number[], latest: string | null, budget: { p50: number; p95: number } | null): SummaryRow {
  const sorted = [...values].sort((a, b) => a - b)
  const p95 = percentile(sorted, 95)
  return {
    key,
    metric,
    count: sorted.length,
    p50: percentile(sorted, 50),
    p95,
    p99: percentile(sorted, 99),
    latest,
    budget,
    overBudget: budget ? p95 > budget.p95 : false,
  }
}

/**
 * Aggregates the last `window` of samples for one organization. Anonymous samples are excluded:
 * the dashboard must never mix organizations together.
 */
export async function summaryForOrganization(organizationId: string, window: TelemetryWindow): Promise<TelemetrySummary> {
  const since = new Date(Date.now() - WINDOW_HOURS[window] * 3600_000)
  const rows = process.env.DATABASE_URL
    ? await db.select({
        kind: telemetrySamples.kind,
        screen: telemetrySamples.screen,
        route: telemetrySamples.route,
        metric: telemetrySamples.metric,
        value: telemetrySamples.value,
        createdAt: telemetrySamples.createdAt,
      }).from(telemetrySamples)
        .where(and(eq(telemetrySamples.organizationId, organizationId), gte(telemetrySamples.createdAt, since)))
        .orderBy(desc(telemetrySamples.createdAt))
        .limit(20_000)
    : []

  const screenGroups = new Map<string, { key: string; values: number[]; latest: string | null }>()
  const endpointGroups = new Map<string, { values: number[]; latest: string | null }>()

  for (const row of rows) {
    const latest = row.createdAt.toISOString()
    if (row.kind === 'api') {
      const key = row.route ?? 'unknown'
      const group = endpointGroups.get(key) ?? { values: [], latest: null }
      group.values.push(row.value)
      group.latest ??= latest
      endpointGroups.set(key, group)
    } else {
      const key = row.screen ?? 'unknown'
      const groupKey = `${key}\u0000${row.metric}`
      const group = screenGroups.get(groupKey) ?? { key, values: [], latest: null }
      group.values.push(row.value)
      group.latest ??= latest
      screenGroups.set(groupKey, group)
    }
  }

  const screens = [...screenGroups.entries()]
    .map(([groupKey, group]) => {
      const metric = groupKey.split('\u0000')[1]
      return summarizeGroup(group.key, metric, group.values, group.latest, screenBudget(group.key, metric))
    })
    .sort((a, b) => Number(b.overBudget) - Number(a.overBudget) || b.p95 - a.p95)

  const endpoints = [...endpointGroups.entries()]
    .map(([route, group]) => summarizeGroup(route, 'api', group.values, group.latest, endpointBudget(route)))
    .sort((a, b) => Number(b.overBudget) - Number(a.overBudget) || b.p95 - a.p95)

  return {
    window,
    since: since.toISOString(),
    total: rows.length,
    screens,
    endpoints,
    baseline: {
      provisional: TELEMETRY_BASELINE.provisional,
      generatedAt: TELEMETRY_BASELINE.generatedAt,
      environment: TELEMETRY_BASELINE.environment,
    },
  }
}
