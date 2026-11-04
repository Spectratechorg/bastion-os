import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GuardPingSchema } from '../lib/kafka/types'
import { getKafkaConfig } from '../lib/kafka/consumer'

test('kafka schema: validates correct guard GPS ping payload', () => {
  const valid = {
    guardId: '123e4567-e89b-12d3-a456-426614174000',
    latitude: 6.4281,
    longitude: 3.4219,
    batteryLevel: 85,
    accuracy: 3.2,
    speed: 1.4,
    timestamp: '2026-11-04T15:00:00Z',
  }

  const result = GuardPingSchema.safeParse(valid)
  assert.equal(result.success, true)
  if (result.success) {
    assert.equal(result.data.guardId, valid.guardId)
    assert.equal(result.data.latitude, 6.4281)
    assert.equal(result.data.batteryLevel, 85)
  }
})

test('kafka schema: rejects invalid coordinates', () => {
  // Invalid latitude (> 90)
  const badLat = {
    guardId: 'guard-1',
    latitude: 95.0,
    longitude: 3.4219,
  }
  const latResult = GuardPingSchema.safeParse(badLat)
  assert.equal(latResult.success, false)

  // Invalid longitude (> 180)
  const badLng = {
    guardId: 'guard-1',
    latitude: 6.4281,
    longitude: 200.0,
  }
  const lngResult = GuardPingSchema.safeParse(badLng)
  assert.equal(lngResult.success, false)
})

test('kafka schema: rejects missing guardId', () => {
  const missingGuard = {
    latitude: 6.4281,
    longitude: 3.4219,
  }
  const result = GuardPingSchema.safeParse(missingGuard)
  assert.equal(result.success, false)
})

test('kafka config: extracts defaults and overrides properly', () => {
  const defaultConfig = getKafkaConfig()
  assert.ok(defaultConfig.brokers.length > 0)
  assert.equal(defaultConfig.topic, 'guard-gps-pings')
  assert.equal(defaultConfig.groupId, 'bastion-guard-pings')

  const custom = getKafkaConfig({
    brokers: ['kafka.prod:9092'],
    topic: 'custom-topic',
    groupId: 'custom-group',
  })
  assert.deepEqual(custom.brokers, ['kafka.prod:9092'])
  assert.equal(custom.topic, 'custom-topic')
  assert.equal(custom.groupId, 'custom-group')
})
