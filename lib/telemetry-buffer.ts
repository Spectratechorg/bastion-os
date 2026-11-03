import type { TelemetrySampleInput } from '@/lib/telemetry-shared'

export type BufferedSample = TelemetrySampleInput & { organizationId: string | null }

export type BufferSnapshot = {
  depth: number
  accepted: number
  persisted: number
  rejected: number
  flushErrors: number
  abandonedFlushes: number
  batches: number
  maxDepth: number
  capacity: number
}

export type EnqueueResult = { accepted: number; rejected: number }

/**
 * A bounded, concurrency-safe queue in front of the telemetry writer.
 *
 * The ingest route must answer in single-digit milliseconds, so it never awaits the database:
 * it enqueues and returns, and the write happens afterwards. Backpressure is explicit — when the
 * queue is full the caller gets a rejection and can answer 429, so a message is never dropped
 * silently. `drain()` exists so tests can prove every accepted sample reached the writer.
 */
export function createSampleBuffer(
  persist: (batch: BufferedSample[]) => Promise<void>,
  options: { capacity?: number; batchSize?: number; flushTimeoutMs?: number } = {},
) {
  const capacity = options.capacity ?? 25_000
  const batchSize = options.batchSize ?? 500
  /**
   * A write started inside a request can be severed when that request ends (Next tears down the
   * async context, so the promise never settles). Without this watchdog one severed write would
   * wedge the queue forever and every later sample would be rejected.
   */
  const flushTimeoutMs = options.flushTimeoutMs ?? 5_000

  let queue: BufferedSample[] = []
  let inFlight: Promise<void> | null = null
  let inFlightSince = 0
  let passId = 0
  const counters = { accepted: 0, persisted: 0, rejected: 0, flushErrors: 0, abandonedFlushes: 0, batches: 0, maxDepth: 0 }

  function enqueue(samples: BufferedSample[]): EnqueueResult {
    if (samples.length === 0) return { accepted: 0, rejected: 0 }
    if (queue.length + samples.length > capacity) {
      counters.rejected += samples.length
      return { accepted: 0, rejected: samples.length }
    }
    queue.push(...samples)
    counters.accepted += samples.length
    counters.maxDepth = Math.max(counters.maxDepth, queue.length)
    return { accepted: samples.length, rejected: 0 }
  }

  /** Flushes until the queue is empty. Concurrent callers share one in-flight pass. */
  function flush(): Promise<void> {
    if (inFlight) {
      if (Date.now() - inFlightSince < flushTimeoutMs) return inFlight
      // The previous pass was severed with its request context; abandon it and start a new one.
      counters.abandonedFlushes += 1
      inFlight = null
    }

    const id = ++passId
    const pass = (async () => {
      try {
        while (queue.length > 0) {
          const batch = queue.splice(0, batchSize)
          try {
            await persist(batch)
            counters.persisted += batch.length
            counters.batches += 1
          } catch {
            // Put the batch back at the front and stop; the next flush retries it.
            counters.flushErrors += 1
            queue.unshift(...batch)
            break
          }
        }
      } finally {
        if (id === passId) inFlight = null
      }
    })()
    inFlight = pass
    inFlightSince = Date.now()
    return pass
  }

  /**
   * Flushes until empty or the deadline passes. Returns whether it confirmed an empty queue
   * before the deadline; a flush already in flight keeps running, so no sample is dropped.
   */
  async function drain(timeoutMs = 10_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs
    const wait = (ms: number) => new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms))
    while (true) {
      const remaining = Math.max(0, deadline - Date.now())
      await Promise.race([flush().then(() => true), wait(remaining)])
      // Empty queue is not enough: a spliced batch may still be in flight.
      if (queue.length === 0 && inFlight === null) return true
      if (Date.now() >= deadline) return false
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  }

  function snapshot(): BufferSnapshot {
    return { ...counters, depth: queue.length, capacity }
  }

  return { enqueue, flush, drain, snapshot }
}

export type SampleBuffer = ReturnType<typeof createSampleBuffer>
