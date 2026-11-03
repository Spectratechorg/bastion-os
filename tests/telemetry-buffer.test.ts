import assert from 'node:assert/strict'
import test from 'node:test'

import { createSampleBuffer, type BufferedSample } from '../lib/telemetry-buffer'

const sample = (value: number): BufferedSample => ({
  kind: 'api',
  metric: 'api',
  value,
  route: '/loadtest',
  organizationId: 'org-1',
})

test('buffer enqueues without persisting and reports depth', () => {
  const writes: BufferedSample[][] = []
  const buffer = createSampleBuffer(async (batch) => { writes.push(batch) })

  const result = buffer.enqueue([sample(1), sample(2)])
  assert.deepEqual(result, { accepted: 2, rejected: 0 })
  assert.equal(buffer.snapshot().depth, 2)
  assert.equal(buffer.snapshot().persisted, 0)
  assert.equal(writes.length, 0)
})

test('flush persists everything once and counts batches', async () => {
  const writes: BufferedSample[][] = []
  const buffer = createSampleBuffer(async (batch) => { writes.push(batch) }, { batchSize: 2 })

  buffer.enqueue([sample(1), sample(2), sample(3)])
  await buffer.flush()

  assert.equal(buffer.snapshot().persisted, 3)
  assert.equal(buffer.snapshot().batches, 2)
  assert.equal(buffer.snapshot().depth, 0)
  assert.equal(writes.flat().length, 3)
})

test('enqueue rejects explicitly when the queue is full, never silently', async () => {
  const buffer = createSampleBuffer(async () => undefined, { capacity: 2 })

  assert.deepEqual(buffer.enqueue([sample(1), sample(2)]), { accepted: 2, rejected: 0 })
  assert.deepEqual(buffer.enqueue([sample(3)]), { accepted: 0, rejected: 1 })
  assert.equal(buffer.snapshot().rejected, 1)
  assert.equal(buffer.snapshot().depth, 2)
})

test('a failed write is retried, not lost', async () => {
  let attempts = 0
  const persisted: number[] = []
  const buffer = createSampleBuffer(async (batch) => {
    attempts += 1
    if (attempts === 1) throw new Error('database unavailable')
    for (const row of batch) persisted.push(row.value)
  })

  buffer.enqueue([sample(7)])
  await buffer.flush()
  assert.equal(buffer.snapshot().flushErrors, 1)
  assert.equal(buffer.snapshot().depth, 1, 'the failed batch is kept for retry')

  await buffer.flush()
  assert.deepEqual(persisted, [7])
  assert.equal(buffer.snapshot().depth, 0)
})

test('drain waits for a slow writer and reports completion', async () => {
  const buffer = createSampleBuffer(async () => { await new Promise((resolve) => setTimeout(resolve, 20)) })
  buffer.enqueue([sample(1), sample(2)])
  assert.equal(await buffer.drain(2_000), true)
  assert.equal(buffer.snapshot().depth, 0)
  assert.equal(buffer.snapshot().persisted, 2)
})

test('drain reports a deadline it cannot meet without dropping samples', async () => {
  const buffer = createSampleBuffer(async () => { await new Promise((resolve) => setTimeout(resolve, 50)) })
  buffer.enqueue([sample(1), sample(2)])
  assert.equal(await buffer.drain(10), false)
  assert.equal(buffer.snapshot().persisted, 0, 'the batch is still being written')

  await new Promise((resolve) => setTimeout(resolve, 80))
  assert.equal(buffer.snapshot().persisted, 2, 'the in-flight write still lands')
})

test('a severed write is abandoned so the queue keeps moving', async () => {
  let calls = 0
  const persisted: number[] = []
  const buffer = createSampleBuffer(async (batch) => {
    calls += 1
    if (calls === 1) await new Promise(() => { /* simulates a promise whose context was torn down */ })
    for (const row of batch) persisted.push(row.value)
  }, { flushTimeoutMs: 20 })

  buffer.enqueue([sample(1)])
  void buffer.flush()
  await new Promise((resolve) => setTimeout(resolve, 40))

  buffer.enqueue([sample(2)])
  await buffer.flush()

  assert.equal(buffer.snapshot().abandonedFlushes, 1)
  assert.deepEqual(persisted, [2])
})
