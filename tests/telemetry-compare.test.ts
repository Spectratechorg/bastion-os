import assert from 'node:assert/strict'
import test from 'node:test'

import { compareTelemetry, groupStats, type ComparableSample } from '../lib/telemetry-compare'

const sample = (overrides: Partial<ComparableSample> = {}): ComparableSample => ({
  kind: 'web-vital',
  screen: 'overview',
  route: null,
  metric: 'lcp',
  value: 1200,
  rating: 'good',
  device: 'desktop',
  navigationType: 'navigate',
  ...overrides,
})

test('identical multisets compare equal', () => {
  const rows = [sample(), sample({ value: 900 }), sample({ screen: 'guards' })]
  const result = compareTelemetry(rows, rows.map((row) => ({ ...row })))

  assert.equal(result.equal, true)
  assert.equal(result.matched, 3)
  assert.equal(result.source, 3)
  assert.equal(result.replayed, 3)
})

test('a changed value is reported as drift, not loss plus duplicate', () => {
  const result = compareTelemetry([sample({ value: 1200 })], [sample({ value: 1250 })])

  assert.equal(result.equal, false)
  assert.equal(result.missing.length, 0)
  assert.equal(result.extra.length, 0)
  assert.equal(result.drift.length, 1)
  assert.equal(result.drift[0].delta, 50)
})

test('a missing row is a loss', () => {
  const result = compareTelemetry([sample(), sample({ value: 900 })], [sample()])

  assert.equal(result.equal, false)
  assert.equal(result.missing.length, 1)
  assert.equal(result.missing[0].value, 900)
  assert.equal(result.matched, 1)
})

test('a duplicated row is an extra, and counts are respected', () => {
  const result = compareTelemetry([sample()], [sample(), sample()])

  assert.equal(result.equal, false)
  assert.equal(result.extra.length, 1)
  assert.equal(result.matched, 1)
})

test('a different screen is a loss plus an extra, not drift', () => {
  const result = compareTelemetry([sample({ screen: 'overview' })], [sample({ screen: 'guards' })])

  assert.equal(result.drift.length, 0)
  assert.equal(result.missing.length, 1)
  assert.equal(result.extra.length, 1)
})

test('group stats summarise screens and endpoints separately', () => {
  const stats = groupStats([
    sample({ value: 100 }), sample({ value: 300 }),
    sample({ kind: 'api', screen: null, route: '/api/dashboard', metric: 'api', value: 20 }),
  ])

  assert.equal(stats.get('overview lcp')?.count, 2)
  assert.equal(stats.get('overview lcp')?.p50, 200)
  assert.equal(stats.get('api /api/dashboard')?.p95, 20)
})
