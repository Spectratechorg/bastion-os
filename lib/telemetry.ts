import { and, desc, eq, gte, lt } from 'drizzle-orm'

import { getActiveOrganization } from '@/lib/auth/organization'
import { db } from '@/lib/db'
import { telemetrySamples } from '@/lib/db/schema'
import { endpointBudget, screenBudget, TELEMETRY_BASELINE } from '@/lib/telemetry-baseline'
import {
  percentile,
  WINDOW_HOURS,
  type SummaryRow,
  type TelemetrySampleInput,
  type TelemetrySummary,
  type TelemetryWindow,
} from '@/lib/telemetry-shared'

export type StoredTelemetrySample = TelemetrySampleInput & { createdAt: Date }

/**
 * Persists a batch of samples. Telemetry is best-effort: a missing database or a write failure
 * must never break the request that is being measured, so every error is swallowed here.
 */
export async function recordSamples(samples: TelemetrySampleInput[], organizationId: string | null): Promise<void> {
  if (samples.length === 0 || !process.env.DATABASE_URL) return
  try {
    await db.insert(telemetrySamples).values(samples.map((sample) => ({
      organizationId,
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
  } catch {
    // Never surface telemetry failures to the caller.
  }
}

/**
 * Records an API handler duration after the response has been produced. Resolving the active
 * organization is best-effort: guard routes are unauthenticated and simply record no org.
 */
export function recordServerSample(route: string, durationMs: number, status: number): void {
  void (async () => {
    let organizationId: string | null = null
    try {
      organizationId = (await getActiveOrganization())?.organizationId ?? null
    } catch {
      // No session (guard app) or no database: keep the sample anonymous.
    }
    await recordSamples([{
      kind: 'api',
      route,
      metric: 'api',
      value: Math.max(0, durationMs),
      rating: status >= 500 ? 'error' : status >= 400 ? 'warn' : 'ok',
    }], organizationId)
  })()
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

/** Drops samples older than `maxAgeDays`. Called opportunistically so the table cannot grow forever. */
export async function pruneOldSamples(maxAgeDays = 30): Promise<void> {
  if (!process.env.DATABASE_URL) return
  try {
    await db.delete(telemetrySamples).where(lt(telemetrySamples.createdAt, new Date(Date.now() - maxAgeDays * 86_400_000)))
  } catch {
    // Best-effort housekeeping.
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
