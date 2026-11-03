import { randomUUID } from 'node:crypto'
import pg from 'pg'

import { percentile } from '../lib/telemetry-shared'

/**
 * Load-tests the telemetry ingest endpoint.
 *
 *   npm run dev                                    # or npm start
 *   npm run perf:load                              # defaults below
 *
 * Two phases, because they answer different questions:
 *
 *   Latency  one request at a time: per-request ack p95 must be under TARGET_MS (default 5 ms).
 *   Load     many requests in flight: measures throughput and proves nothing is lost or rejected.
 *
 * No lost messages means every sample the server acknowledged with 202 exists in Postgres. Every
 * message carries a unique route (`/loadtest/<run-id>`) so the count is exact and unrelated
 * telemetry cannot mask a missing sample.
 *
 * Protected routes need a session cookie, otherwise every request answers 401 in about a
 * millisecond and the measurement is meaningless:
 *
 *   COOKIE="better-auth.session_token=..." npm run perf:load
 */

const baseUrl = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const latencyRequests = Math.max(1, Number(process.env.LATENCY_REQUESTS ?? '200'))
const requests = Math.max(1, Number(process.env.REQUESTS ?? '1000'))
const batchSize = Math.min(30, Math.max(1, Number(process.env.BATCH ?? '10')))
const concurrency = Math.min(requests, Math.max(1, Number(process.env.CONCURRENCY ?? '20')))
const targetMs = Number(process.env.TARGET_MS ?? '5')
const cookie = process.env.COOKIE ?? ''
const runId = process.env.RUN_ID ?? randomUUID().slice(0, 8)
const runRoute = `/loadtest/${runId}`

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required so stored samples can be verified.')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 })

type Result = { ms: number; status: number; accepted: number; rejected: number }
type Phase = { label: string; samples: number[]; statuses: Map<number, number>; accepted: number; rejected: number; elapsed: number }

function body(index: number) {
  return JSON.stringify({
    samples: Array.from({ length: batchSize }, (_, offset) => ({
      kind: 'api',
      metric: 'api',
      route: runRoute,
      value: index * batchSize + offset,
    })),
  })
}

async function send(index: number): Promise<Result> {
  const started = performance.now()
  try {
    const response = await fetch(`${baseUrl}/api/telemetry`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: body(index),
      keepalive: true,
    })
    const text = await response.text()
    let parsed: { accepted?: number; rejected?: number } = {}
    try { parsed = JSON.parse(text) as typeof parsed } catch { /* non-JSON error page */ }
    return {
      ms: performance.now() - started,
      status: response.status,
      accepted: parsed.accepted ?? (response.ok ? batchSize : 0),
      rejected: parsed.rejected ?? 0,
    }
  } catch {
    return { ms: performance.now() - started, status: 0, accepted: 0, rejected: 0 }
  }
}

async function runPhase(label: string, total: number, parallel: number): Promise<Phase> {
  const phase: Phase = { label, samples: [], statuses: new Map(), accepted: 0, rejected: 0, elapsed: 0 }
  let index = 0
  const started = performance.now()

  async function worker() {
    while (true) {
      const current = index
      index += 1
      if (current >= total) return
      const result = await send(current)
      phase.samples.push(result.ms)
      phase.statuses.set(result.status, (phase.statuses.get(result.status) ?? 0) + 1)
      phase.accepted += result.accepted
      phase.rejected += result.rejected
    }
  }

  await Promise.all(Array.from({ length: parallel }, worker))
  phase.elapsed = performance.now() - started
  return phase
}

function quantiles(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  return {
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted[sorted.length - 1] ?? 0,
  }
}

async function main() {
  console.log(`Telemetry load test ${runId}`)
  console.log(`  latency phase: ${latencyRequests} requests, 1 in flight, ${batchSize} samples each`)
  console.log(`  load phase:    ${requests} requests, ${concurrency} in flight, ${batchSize} samples each`)
  console.log(`  target: p95 ack < ${targetMs} ms, zero lost or rejected messages\n`)

  // Warm-up: session cache, route compilation and the connection pool.
  for (let i = 0; i < 10; i += 1) await send(-1)

  const runStartedAt = new Date()
  const latency = await runPhase('latency', latencyRequests, 1)
  // Let the asynchronous writes land before the load phase starts, so the server-side window
  // below contains latency-phase requests only instead of spilling into the concurrency test.
  await new Promise((resolve) => setTimeout(resolve, 1_500))
  const latencyEndedAt = new Date()
  const load = await runPhase('load', requests, concurrency)

  // Flush the per-response writes, then read the authoritative count from Postgres.
  const drainStarted = performance.now()
  try {
    await fetch(`${baseUrl}/api/telemetry/health?drain=1`, { headers: cookie ? { cookie } : {} })
  } catch { /* the database check below is authoritative */ }
  const drainMs = performance.now() - drainStarted

  const accepted = latency.accepted + load.accepted
  const rejected = latency.rejected + load.rejected

  const deadline = Date.now() + 15_000
  let stored = 0
  while (Date.now() < deadline) {
    const result = await pool.query<{ count: string }>('select count(*)::text as count from telemetry_samples where route = $1', [runRoute])
    stored = Number(result.rows[0]?.count ?? 0)
    if (stored >= accepted) break
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  // The handler's own duration, recorded by timed(). Scoped to the latency phase: the load phase
  // intentionally queues requests, so its p95 describes concurrency, not per-request cost.
  const server = await pool.query<{ p95: string; p50: string; count: string }>(
    `select round(percentile_cont(0.5) within group (order by value)::numeric, 2)::text as p50,
            round(percentile_cont(0.95) within group (order by value)::numeric, 2)::text as p95,
            count(*)::text as count
     from telemetry_samples where route = '/api/telemetry' and created_at between $1 and $2`,
    [runStartedAt, latencyEndedAt],
  )

  for (const phase of [latency, load]) {
    const q = quantiles(phase.samples)
    const statuses = [...phase.statuses.entries()].map(([status, count]) => `${status} x${count}`).join(', ') || 'none'
    console.log(`${phase.label === 'latency' ? 'Latency (1 in flight)' : `Load (${concurrency} in flight)`}`)
    console.log(`  ack p50 ${q.p50.toFixed(2)} ms   p95 ${q.p95.toFixed(2)} ms   p99 ${q.p99.toFixed(2)} ms   max ${q.max.toFixed(2)} ms`)
    console.log(`  ${(phase.samples.length / (phase.elapsed / 1000)).toFixed(0)} req/s   responses: ${statuses}`)
  }

  const serverRow = server.rows[0]
  console.log(`\nServer handler time, latency phase: p50 ${serverRow?.p50 ?? '—'} ms   p95 ${serverRow?.p95 ?? '—'} ms   (${serverRow?.count ?? 0} samples)`)
  console.log(`Messages: accepted ${accepted}, rejected ${rejected}, stored ${stored}, lost ${accepted - stored}`)
  console.log(`Drain: ${drainMs.toFixed(0)} ms`)

  await pool.end()

  const latencyP95 = quantiles(latency.samples).p95
  const serverP95 = Number(serverRow?.p95 ?? Number.POSITIVE_INFINITY)
  const lost = accepted - stored
  const latencyOk = latencyP95 < targetMs && serverP95 < targetMs
  const lossOk = lost === 0 && rejected === 0

  console.log(`\n${latencyOk ? 'PASS' : 'FAIL'}  p95 ack ${latencyP95.toFixed(2)} ms and server p95 ${serverP95.toFixed(2)} ms < ${targetMs} ms`)
  console.log(`${lossOk ? 'PASS' : 'FAIL'}  no lost messages (${lost} lost, ${rejected} rejected)`)
  if (!latencyOk || !lossOk) process.exitCode = 1
}

void main()
