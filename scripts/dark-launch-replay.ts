import pg from 'pg'

import { compareTelemetry, groupStats, type ComparableSample } from '../lib/telemetry-compare'
import { REPLAY_HEADER, percentile, type SampleKind } from '../lib/telemetry-shared'
import { closeTelemetryRedis, publishSamples } from '../lib/telemetry-stream'

/**
 * Dark launch: replay real, already-stored telemetry through the new stack and compare what comes
 * out with what went in.
 *
 *   npm run dev                                  # gateway + worker running
 *   COOKIE="better-auth.session_token=..." npm run perf:replay
 *
 * Replayed rows are tagged with a run id and excluded from the dashboard, so production metrics
 * are untouched.
 *
 *   VIA=gateway  (default) POST /api/telemetry, exercising gateway -> Redis -> worker -> Postgres
 *   VIA=stream             XADD directly, exercising Redis -> worker -> Postgres
 *
 * Comparison covers kind, screen, route, metric, value, rating, device and navigation type.
 * `organizationId` is excluded on purpose: the gateway attributes a replay to the operator running
 * it. `createdAt` and `id` change by design.
 */

const baseUrl = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const via = (process.env.VIA ?? 'gateway') as 'gateway' | 'stream'
const limit = Math.max(1, Number(process.env.LIMIT ?? '500'))
const batchSize = Math.min(30, Math.max(1, Number(process.env.BATCH ?? '10')))
// Latency is reported, not gated by default: a replay is a correctness check over a handful of
// sequential batches, and one cold request dominates p95. perf:load owns the 5 ms budget; set
// TARGET_MS explicitly if this run should also fail on ack latency.
const targetMs = process.env.TARGET_MS ? Number(process.env.TARGET_MS) : null
const timeoutMs = Math.max(1_000, Number(process.env.TIMEOUT_MS ?? '60000'))
const cookie = process.env.COOKIE ?? ''
const cleanup = process.env.CLEANUP === 'true'
const runId = (process.env.RUN_ID ?? `dark-${Date.now().toString(36)}`).toLowerCase()

if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(runId)) {
  console.error(`RUN_ID must match ${String(/^[a-z0-9][a-z0-9-]{0,39}$/)}`)
  process.exit(1)
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required so the replay can read the source and verify the result.')
  process.exit(1)
}
if (via === 'stream' && !process.env.REDIS_URL) {
  console.error('VIA=stream needs REDIS_URL.')
  process.exit(1)
}

type SourceRow = ComparableSample & { organizationId: string | null }
type StoredTelemetry = { kind: SampleKind; metric: string; value: number; screen?: string; route?: string; rating?: string; device?: string; navigationType?: string }

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 })

function normalize(row: Record<string, unknown>): ComparableSample {
  return {
    kind: String(row.kind),
    screen: (row.screen as string | null) ?? null,
    route: (row.route as string | null) ?? null,
    metric: String(row.metric),
    value: Number(row.value),
    rating: (row.rating as string | null) ?? null,
    device: (row.device as string | null) ?? null,
    navigationType: (row.navigationType as string | null) ?? null,
  }
}

async function readSource(): Promise<SourceRow[]> {
  const result = await pool.query(
    `select kind, screen, route, metric, value, rating, device,
            navigation_type as "navigationType", organization_id as "organizationId"
     from telemetry_samples
     where replay_run is null
     order by created_at desc, id
     limit $1`,
    [limit],
  )
  return result.rows as SourceRow[]
}

function payload(sample: SourceRow): StoredTelemetry {
  return {
    kind: sample.kind as SampleKind,
    metric: sample.metric,
    value: sample.value,
    screen: sample.screen ?? undefined,
    route: sample.route ?? undefined,
    rating: sample.rating ?? undefined,
    device: sample.device ?? undefined,
    navigationType: sample.navigationType ?? undefined,
  }
}

type ReplayResult = { accepted: number; failed: number; latencies: number[] }

async function replayViaGateway(rows: SourceRow[]): Promise<ReplayResult> {
  const result: ReplayResult = { accepted: 0, failed: 0, latencies: [] }
  if (!cookie) console.warn('Warning: no COOKIE set. The gateway only tags replay rows for authenticated callers.')

  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize)
    const body = JSON.stringify({ samples: batch.map((row) => ({ ...payload(row), replayRun: runId })) })
    const started = performance.now()
    try {
      const response = await fetch(`${baseUrl}/api/telemetry`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [REPLAY_HEADER]: runId,
          ...(cookie ? { cookie } : {}),
        },
        body,
      })
      result.latencies.push(performance.now() - started)
      const parsed = await response.json().catch(() => ({})) as { accepted?: number; rejected?: number }
      if (response.ok) {
        result.accepted += parsed.accepted ?? batch.length
      } else {
        result.failed += batch.length
        console.warn(`  batch ${index / batchSize + 1}: HTTP ${response.status} ${JSON.stringify(parsed)}`)
      }
    } catch (error) {
      result.failed += batch.length
      console.warn(`  batch ${index / batchSize + 1}: ${error instanceof Error ? error.message : error}`)
    }
  }
  return result
}

async function replayViaStream(rows: SourceRow[]): Promise<ReplayResult> {
  const result: ReplayResult = { accepted: 0, failed: 0, latencies: [] }
  const chunk = 500
  for (let index = 0; index < rows.length; index += chunk) {
    const batch = rows.slice(index, index + chunk).map((row) => ({
      ...payload(row),
      organizationId: row.organizationId,
      replayRun: runId,
    }))
    const started = performance.now()
    try {
      await publishSamples(batch)
      result.latencies.push(performance.now() - started)
      result.accepted += batch.length
    } catch (error) {
      result.failed += batch.length
      console.warn(`  chunk ${index / chunk + 1}: ${error instanceof Error ? error.message : error}`)
    }
  }
  return result
}

async function waitForReplay(expected: number): Promise<number> {
  const deadline = Date.now() + timeoutMs
  let stored = 0
  while (Date.now() < deadline) {
    const result = await pool.query<{ count: string }>('select count(*)::text as count from telemetry_samples where replay_run = $1', [runId])
    stored = Number(result.rows[0]?.count ?? 0)
    if (stored >= expected) return stored
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  return stored
}

async function readReplay(): Promise<ComparableSample[]> {
  const result = await pool.query(
    `select kind, screen, route, metric, value, rating, device, navigation_type as "navigationType"
     from telemetry_samples where replay_run = $1 order by created_at, id`,
    [runId],
  )
  return result.rows.map(normalize)
}

async function main() {
  const rows = await readSource()
  if (rows.length === 0) {
    console.error('No real telemetry rows found (replay_run is null). Use the app first, or run the load test.')
    process.exit(1)
  }

  console.log(`Dark launch replay ${runId}`)
  console.log(`  source: ${rows.length} real rows from telemetry_samples (replay_run is null)`)
  console.log(`  target: ${via === 'gateway' ? `gateway ${baseUrl}/api/telemetry` : 'Redis stream'}\n`)

  const started = performance.now()
  const result = via === 'gateway' ? await replayViaGateway(rows) : await replayViaStream(rows)
  const stored = await waitForReplay(rows.length)
  const waited = performance.now() - started

  console.log(`Accepted ${result.accepted}/${rows.length}, failed ${result.failed}`)
  if (result.latencies.length > 0) {
    const sorted = [...result.latencies].sort((a, b) => a - b)
    console.log(`Ack time: p50 ${percentile(sorted, 50).toFixed(2)} ms, p95 ${percentile(sorted, 95).toFixed(2)} ms, max ${sorted[sorted.length - 1].toFixed(2)} ms`)
  }
  console.log(`Stored ${stored}/${rows.length} in ${Math.round(waited)} ms\n`)

  const replayed = await readReplay()
  const comparison = compareTelemetry(rows.map(normalize), replayed)
  console.log(`Matched ${comparison.matched}/${comparison.source} · drift ${comparison.drift.length} · missing ${comparison.missing.length} · extra ${comparison.extra.length}`)

  const sourceStats = groupStats(rows.map(normalize))
  const replayStats = groupStats(replayed)
  const groupDiffs: string[] = []
  for (const [key, stats] of sourceStats) {
    const other = replayStats.get(key)
    if (!other) { groupDiffs.push(`${key}: missing entirely`); continue }
    if (other.count !== stats.count) groupDiffs.push(`${key}: count ${stats.count} -> ${other.count}`)
    else if (Math.abs(other.p50 - stats.p50) > 0.001) groupDiffs.push(`${key}: p50 ${stats.p50} -> ${other.p50}`)
  }
  if (groupDiffs.length > 0) {
    console.log('\nGroup differences:')
    for (const line of groupDiffs.slice(0, 20)) console.log(`  ${line}`)
  }

  const examples = [...comparison.missing, ...comparison.extra]
  if (examples.length > 0) {
    console.log('\nExample mismatches:')
    for (const sample of examples.slice(0, 5)) console.log(`  ${JSON.stringify(sample)}`)
  }
  if (comparison.drift.length > 0) {
    console.log('\nValue drift:')
    for (const drift of comparison.drift.slice(0, 5)) {
      console.log(`  ${drift.source.kind} ${drift.source.route ?? drift.source.screen ?? ''} ${drift.source.metric}: ${drift.source.value} -> ${drift.replayed.value} (${drift.delta > 0 ? '+' : ''}${drift.delta.toFixed(3)})`)
    }
  }

  if (cleanup) {
    const deleted = await pool.query('delete from telemetry_samples where replay_run = $1', [runId])
    console.log(`\nRemoved ${deleted.rowCount ?? 0} replay rows.`)
  }

  await closeTelemetryRedis()
  await pool.end()

  const latencyOk = targetMs === null || via !== 'gateway' || result.latencies.length === 0 || percentile([...result.latencies].sort((a, b) => a - b), 95) < targetMs
  const complete = result.failed === 0 && stored === rows.length
  const verdict = comparison.equal && complete && latencyOk
  console.log(`\n${verdict ? 'PASS' : 'FAIL'}  replay is lossless and identical${targetMs === null ? '' : ` and p95 < ${targetMs} ms`}`)
  if (!comparison.equal || !complete || !latencyOk) process.exitCode = 1
}

void main().catch(async (error) => {
  console.error('Replay failed:', error instanceof Error ? error.message : error)
  try { await closeTelemetryRedis() } catch { /* already closed */ }
  try { await pool.end() } catch { /* already closed */ }
  process.exitCode = 1
})
