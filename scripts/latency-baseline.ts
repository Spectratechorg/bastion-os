import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { percentile } from '../lib/telemetry-shared'

/**
 * Records the endpoint half of the latency baseline.
 *
 *   npm run dev                      # in another terminal
 *   npm run perf:baseline            # defaults to http://localhost:3000, 20 samples per route
 *
 * Protected routes need a session cookie, otherwise they answer 401 in ~1 ms and the numbers are
 * meaningless. Copy the `better-auth.session_token` cookie from your browser:
 *
 *   BASE_URL=http://localhost:3000 COOKIE="better-auth.session_token=..." npm run perf:baseline
 *
 * Screen timings are not measured here: they come from real browsers through /api/telemetry.
 */

const endpoints = [
  '/api/dashboard',
  '/api/operations?section=guards',
  '/api/patrols',
  '/api/guard/me',
  '/api/telemetry?window=24h',
]

const baseUrl = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const iterations = Math.max(3, Number(process.env.ITERATIONS ?? '20'))
const cookie = process.env.COOKIE ?? ''

async function measure(url: string) {
  const started = performance.now()
  const response = await fetch(url, { headers: cookie ? { cookie } : {}, cache: 'no-store' })
  await response.arrayBuffer()
  return { ms: performance.now() - started, status: response.status }
}

async function main() {
  const results: Record<string, { p50: number; p95: number }> = {}
  let unauthorized = 0

  for (const path of endpoints) {
    const url = `${baseUrl}${path}`
    try {
      await measure(url) // warm-up: connection setup, route compilation
      const samples: number[] = []
      for (let i = 0; i < iterations; i += 1) {
        const { ms, status } = await measure(url)
        if (status === 401 || status === 403) unauthorized += 1
        samples.push(ms)
      }
      samples.sort((a, b) => a - b)
      results[path] = {
        p50: Math.round(percentile(samples, 50)),
        p95: Math.round(percentile(samples, 95)),
      }
      console.log(`${path.padEnd(35)} p50 ${String(results[path].p50).padStart(5)} ms   p95 ${String(results[path].p95).padStart(5)} ms`)
    } catch (error) {
      console.error(`Skipped ${path}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  if (Object.keys(results).length === 0) {
    console.error(`\nNo endpoint could be measured. Is the app running at ${baseUrl}?`)
    process.exitCode = 1
    return
  }
  if (unauthorized > 0) {
    console.warn('\nWarning: some requests were rejected with 401/403. Set COOKIE to measure signed-in latency.')
  }

  const environment = `${baseUrl} · ${iterations} samples per route · ${new Date().toISOString()}${cookie ? '' : ' · unauthenticated'}`
  const output = { generatedAt: new Date().toISOString(), environment, endpoints: results }
  const target = resolve(process.cwd(), 'latency-baseline.json')
  writeFileSync(target, `${JSON.stringify(output, null, 2)}\n`)
  console.log(`\nWrote ${target}`)
  console.log('Commit it so the dashboard compares against the measured baseline.')
}

void main()
