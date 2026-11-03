import { randomUUID } from 'node:crypto'
import { hostname } from 'node:os'
import { createClient } from 'redis'

import {
  ensureConsumerGroup,
  TELEMETRY_GROUP,
  TELEMETRY_HEARTBEAT,
  TELEMETRY_STREAM,
} from '../lib/telemetry-stream'
import { persistSamples, pruneOldSamples, type StoredSample } from '../lib/telemetry-store'
import { writeEntries, type StreamEntry } from '../lib/telemetry-worker'

/**
 * Consumes the telemetry stream and writes batches to Postgres.
 *
 *   npm run telemetry:worker            # long-running worker
 *   npm run telemetry:worker -- --once  # drain what is queued, then exit (tests, cron)
 *
 * Delivery is at-least-once: entries are acknowledged only after the insert succeeds. Entries left
 * pending by a crashed consumer are reclaimed after RECLAIM_MS. The worker publishes a heartbeat so
 * /api/telemetry/health can tell whether anything is writing.
 */

const BLOCK_MS = 1_000
const COUNT = 50
const RECLAIM_EVERY_LOOPS = 5
const RECLAIM_MS = 10_000
const PRUNE_EVERY_LOOPS = 200

const once = process.argv.includes('--once')
const redisUrl = process.env.REDIS_URL
if (!redisUrl) {
  console.error('REDIS_URL is required.')
  process.exit(1)
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required so the worker can write samples.')
  process.exit(1)
}

const consumer = `${hostname()}:${process.pid}:${randomUUID().slice(0, 6)}`
const client = createClient({ url: redisUrl })
client.on('error', (error) => console.error('[telemetry-worker] redis error:', error instanceof Error ? error.message : error))

let running = true
let totals = { batches: 0, samples: 0, acked: 0, failed: 0 }

function stop(signal: string) {
  if (!running) return
  running = false
  console.log(`[telemetry-worker] ${signal} received, finishing the current batch`)
}

process.on('SIGINT', () => stop('SIGINT'))
process.on('SIGTERM', () => stop('SIGTERM'))

function entriesOf(messages: unknown): StreamEntry[] {
  if (!Array.isArray(messages)) return []
  return messages
    .filter((message): message is { id: string; message: unknown } => Boolean(message) && typeof (message as { id?: unknown }).id === 'string')
    .map((message) => ({ id: message.id, message: message.message }))
}

async function deliver(entries: StreamEntry[]) {
  if (entries.length === 0) return
  const result = await writeEntries(entries, {
    persist: (batch: StoredSample[]) => persistSamples(batch),
    ack: (ids) => client.xAck(TELEMETRY_STREAM, TELEMETRY_GROUP, ids),
    log: (line) => console.warn(`[telemetry-worker] ${line}`),
  })
  totals.batches += 1
  totals.samples += result.samples
  totals.acked += result.acked
  totals.failed += result.failed
}

async function readNew(): Promise<StreamEntry[]> {
  const streams = await client.xReadGroup(
    TELEMETRY_GROUP,
    consumer,
    { key: TELEMETRY_STREAM, id: '>' },
    { BLOCK: BLOCK_MS, COUNT },
  )
  return entriesOf(streams?.[0]?.messages)
}

async function reclaimStale(): Promise<StreamEntry[]> {
  const claimed = await client.xAutoClaim(TELEMETRY_STREAM, TELEMETRY_GROUP, consumer, RECLAIM_MS, '0-0', { COUNT })
  return entriesOf(claimed.messages)
}

async function main() {
  await client.connect()
  await ensureConsumerGroup(client)
  console.log(`[telemetry-worker] consuming ${TELEMETRY_STREAM} as ${consumer}${once ? ' (once)' : ''}`)

  let loops = 0
  while (running) {
    let entries: StreamEntry[] = []
    try {
      entries = await readNew()
      await deliver(entries)
      await client.set(TELEMETRY_HEARTBEAT, new Date().toISOString(), { EX: 15 })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[telemetry-worker] read loop error:', message)
      // Redis restarted or the stream was trimmed away: recreate the group and keep consuming.
      if (message.includes('NOGROUP')) {
        try { await ensureConsumerGroup(client) } catch { /* retried on the next loop */ }
      } else {
        await new Promise((resolve) => setTimeout(resolve, 1_000))
      }
    }

    loops += 1
    if (loops % RECLAIM_EVERY_LOOPS === 0) {
      try {
        await deliver(await reclaimStale())
      } catch (error) {
        console.error('[telemetry-worker] reclaim error:', error instanceof Error ? error.message : error)
      }
    }
    if (loops % PRUNE_EVERY_LOOPS === 0) await pruneOldSamples()

    if (once && entries.length === 0) {
      await deliver(await reclaimStale())
      break
    }
  }

  console.log(`[telemetry-worker] stopping: ${totals.batches} batches, ${totals.samples} samples, ${totals.acked} acked, ${totals.failed} failed`)
  await client.quit()
}

void main().catch(async (error) => {
  console.error('[telemetry-worker] fatal:', error instanceof Error ? error.message : error)
  try { await client.quit() } catch { /* already closed */ }
  process.exitCode = 1
})
