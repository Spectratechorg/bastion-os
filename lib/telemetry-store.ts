import { lt } from 'drizzle-orm'

import { db } from './db'
import { telemetrySamples } from './db/schema'
import type { TelemetrySampleInput } from './telemetry-shared'

/** A sample plus the organization it belongs to. Shared by the buffer, the queue and the worker. */
export type StoredSample = TelemetrySampleInput & { organizationId: string | null }

/**
 * Writes one batch of samples. Kept in its own module so the standalone worker process can use it
 * without importing anything that depends on a request (next/headers, request caches, ...).
 */
export async function persistSamples(batch: StoredSample[]): Promise<void> {
  if (!process.env.DATABASE_URL || batch.length === 0) return
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
}

/** Drops samples older than `maxAgeDays`. Run by the worker and opportunistically by the gateway. */
export async function pruneOldSamples(maxAgeDays = 30): Promise<void> {
  if (!process.env.DATABASE_URL) return
  try {
    await db.delete(telemetrySamples).where(lt(telemetrySamples.createdAt, new Date(Date.now() - maxAgeDays * 86_400_000)))
  } catch {
    // Best-effort housekeeping.
  }
}
