import { decodeSamples } from './telemetry-stream'
import type { StoredSample } from './telemetry-store'

export type StreamEntry = { id: string; message: unknown }

export type WorkerDeps = {
  /** Writes the aggregated batch. Throwing means "not delivered". */
  persist: (batch: StoredSample[]) => Promise<void>
  /** Acknowledges the entries whose samples are now durably written. */
  ack: (ids: string[]) => Promise<number>
  log?: (line: string) => void
}

export type WriteResult = { samples: number; acked: number; failed: number }

/**
 * Aggregates a set of stream entries into one insert and acknowledges only after it succeeds.
 *
 * At-least-once delivery: a failed write leaves the entries in the consumer group's pending list,
 * where the reclaim pass picks them up again. Entries with an undecodable payload are acknowledged
 * so a single bad message cannot block the stream forever.
 */
export async function writeEntries(entries: StreamEntry[], deps: WorkerDeps): Promise<WriteResult> {
  const ids: string[] = []
  const samples: StoredSample[] = []

  for (const entry of entries) {
    if (!entry?.id) continue
    ids.push(entry.id)
    samples.push(...decodeSamples(entry.message))
  }

  if (ids.length === 0) return { samples: 0, acked: 0, failed: 0 }

  try {
    await deps.persist(samples)
  } catch (error) {
    deps.log?.(`write failed for ${ids.length} entries (${samples.length} samples): ${error instanceof Error ? error.message : String(error)}`)
    return { samples: samples.length, acked: 0, failed: ids.length }
  }

  const acked = await deps.ack(ids)
  return { samples: samples.length, acked, failed: ids.length - acked }
}
