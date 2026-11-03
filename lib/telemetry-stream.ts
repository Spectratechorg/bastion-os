import { createClient, type RedisClientType } from 'redis'

import type { StoredSample } from './telemetry-store'

export const TELEMETRY_STREAM = 'bastion:telemetry:samples'
export const TELEMETRY_GROUP = 'bastion:telemetry:writers'
export const TELEMETRY_HEARTBEAT = 'bastion:telemetry:worker:alive'

/** Approximate cap so an unattended stream cannot grow without bound. */
export const TELEMETRY_STREAM_MAXLEN = 200_000

export function redisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL)
}

/**
 * A few connections, used round-robin. Every gateway request appends to the stream; a single
 * connection serialises them (head-of-line blocking pushed p95 from ~4 ms to ~8 ms under 20
 * concurrent requests). A failed connect is not cached, so the next request retries.
 */
const globalForRedis = globalThis as typeof globalThis & { __bastionTelemetryRedis?: Promise<RedisClientType[]> }

export function telemetryRedis(): Promise<RedisClientType[]> {
  if (!process.env.REDIS_URL) return Promise.reject(new Error('REDIS_URL is not configured.'))
  if (!globalForRedis.__bastionTelemetryRedis) {
    const size = Math.max(1, Number(process.env.REDIS_POOL_SIZE ?? '4'))
    globalForRedis.__bastionTelemetryRedis = Promise.all(Array.from({ length: size }, async () => {
      const client = createClient({ url: process.env.REDIS_URL })
      // Without a listener, connection errors are emitted as unhandled 'error' events and crash Node.
      client.on('error', () => undefined)
      await client.connect()
      return client
    })).catch((error: unknown) => {
      globalForRedis.__bastionTelemetryRedis = undefined
      throw error
    })
  }
  return globalForRedis.__bastionTelemetryRedis
}

let cursor = 0
function pick(clients: RedisClientType[]): RedisClientType {
  const client = clients[cursor % clients.length]
  cursor = (cursor + 1) % clients.length
  return client
}

/** Serialises a batch into the field map stored on a stream entry. */
export function encodeSamples(samples: StoredSample[]): Record<string, string> {
  return { v: '1', count: String(samples.length), payload: JSON.stringify(samples) }
}

/** Reads a stream field from the shapes node-redis can return (Map, object or flat pairs). */
export function streamField(message: unknown, field: string): string | null {
  if (!message) return null
  if (message instanceof Map) {
    const value = message.get(field)
    return typeof value === 'string' ? value : value == null ? null : String(value)
  }
  if (Array.isArray(message)) {
    for (let index = 0; index + 1 < message.length; index += 2) {
      if (String(message[index]) === field) return message[index + 1] == null ? null : String(message[index + 1])
    }
    return null
  }
  if (typeof message === 'object') {
    const value = (message as Record<string, unknown>)[field]
    return typeof value === 'string' ? value : value == null ? null : String(value)
  }
  return null
}

function isStoredSample(value: unknown): value is StoredSample {
  if (!value || typeof value !== 'object') return false
  const sample = value as Record<string, unknown>
  return typeof sample.kind === 'string'
    && typeof sample.metric === 'string'
    && typeof sample.value === 'number'
    && (sample.organizationId === null || typeof sample.organizationId === 'string')
}

/**
 * Decodes one stream entry. Malformed payloads decode to an empty list rather than throwing, so a
 * single bad message cannot poison the worker loop forever.
 */
export function decodeSamples(message: unknown): StoredSample[] {
  const payload = streamField(message, 'payload')
  if (!payload) return []
  try {
    const parsed: unknown = JSON.parse(payload)
    return Array.isArray(parsed) ? parsed.filter(isStoredSample) : []
  } catch {
    return []
  }
}

/** Appends one batch to the stream. Throws when Redis is unavailable so the gateway can answer 503. */
export async function publishSamples(samples: StoredSample[]): Promise<string> {
  if (samples.length === 0) return ''
  const client = pick(await telemetryRedis())
  return client.xAdd(TELEMETRY_STREAM, '*', encodeSamples(samples), {
    TRIM: { strategy: 'MAXLEN', strategyModifier: '~', threshold: TELEMETRY_STREAM_MAXLEN },
  })
}

export async function ensureConsumerGroup(client: { xGroupCreate: (key: string, group: string, id: string, options: { MKSTREAM: boolean }) => Promise<unknown> }): Promise<void> {
  try {
    // Start at 0-0, not `$`: samples that reached the stream before the first worker started must
    // still be delivered. `$` would skip them, which is a silent loss.
    await client.xGroupCreate(TELEMETRY_STREAM, TELEMETRY_GROUP, '0-0', { MKSTREAM: true })
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('BUSYGROUP')) throw error
  }
}

export type StreamHealth = {
  /** Entries retained in the stream (trimmed to TELEMETRY_STREAM_MAXLEN). Not backlog. */
  length: number
  /** Entries not yet delivered to the group. This is the backlog that matters. */
  lag: number
  /** Delivered but not acknowledged: a write failed or a worker died. */
  pending: number
  consumers: number | null
  workerAlive: string | null
}

/** Queue depth and worker liveness for the health endpoint. Best-effort: never throws. */
export async function streamHealth(): Promise<StreamHealth | null> {
  try {
    const [client] = await telemetryRedis()
    const [length, groups, heartbeat] = await Promise.all([
      client.xLen(TELEMETRY_STREAM),
      client.xInfoGroups(TELEMETRY_STREAM).catch(() => null),
      client.get(TELEMETRY_HEARTBEAT).catch(() => null),
    ])
    const group = groups?.find((entry) => entry.name === TELEMETRY_GROUP)
    return {
      length,
      lag: group?.lag ?? 0,
      pending: group?.pending ?? 0,
      consumers: group?.consumers ?? null,
      workerAlive: heartbeat ?? null,
    }
  } catch {
    return null
  }
}
