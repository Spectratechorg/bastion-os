import assert from 'node:assert/strict'
import test from 'node:test'

import { decodeSamples, encodeSamples, streamField } from '../lib/telemetry-stream'
import { writeEntries } from '../lib/telemetry-worker'
import type { StoredSample } from '../lib/telemetry-store'

const stored = (value: number): StoredSample => ({
  kind: 'api', metric: 'api', value, route: '/loadtest', organizationId: 'org-1',
})

test('stream fields round-trip through object, Map and flat-pair shapes', () => {
  const fields = encodeSamples([stored(1), stored(2)])
  const fromObject = decodeSamples(fields)
  const fromMap = decodeSamples(new Map(Object.entries(fields)))
  const fromPairs = decodeSamples(Object.entries(fields).flat())

  assert.equal(fromObject.length, 2)
  assert.deepEqual(fromMap, fromObject)
  assert.deepEqual(fromPairs, fromObject)
  assert.equal(streamField(fields, 'count'), '2')
})

test('decode ignores malformed payloads instead of throwing', () => {
  assert.deepEqual(decodeSamples({ payload: 'not json' }), [])
  assert.deepEqual(decodeSamples({ payload: '{"not":"an array"}' }), [])
  assert.deepEqual(decodeSamples({ payload: JSON.stringify([{ kind: 'api' }]) }), [])
  assert.deepEqual(decodeSamples(null), [])
  assert.deepEqual(decodeSamples({}), [])
})

test('worker acknowledges only after the batch is persisted', async () => {
  const persisted: StoredSample[][] = []
  const acked: string[][] = []
  const entries = [
    { id: '1-0', message: encodeSamples([stored(1)]) },
    { id: '2-0', message: encodeSamples([stored(2), stored(3)]) },
  ]

  const result = await writeEntries(entries, {
    persist: async (batch) => { persisted.push(batch) },
    ack: async (ids) => { acked.push(ids); return ids.length },
  })

  assert.equal(result.samples, 3)
  assert.equal(result.acked, 2)
  assert.equal(persisted.length, 1, 'entries are aggregated into one insert')
  assert.deepEqual(acked, [['1-0', '2-0']])
})

test('a failed write leaves every entry pending for reclaim', async () => {
  const acked: string[][] = []
  const result = await writeEntries([{ id: '1-0', message: encodeSamples([stored(1)]) }], {
    persist: async () => { throw new Error('database unavailable') },
    ack: async (ids) => { acked.push(ids); return ids.length },
  })

  assert.equal(result.acked, 0)
  assert.equal(result.failed, 1)
  assert.deepEqual(acked, [], 'nothing is acknowledged when the write fails')
})

test('an entry with an undecodable payload is acknowledged so it cannot block the stream', async () => {
  const acked: string[][] = []
  const result = await writeEntries([{ id: '9-0', message: { payload: 'garbage' } }], {
    persist: async () => undefined,
    ack: async (ids) => { acked.push(ids); return ids.length },
  })

  assert.equal(result.samples, 0)
  assert.deepEqual(acked, [['9-0']])
})
