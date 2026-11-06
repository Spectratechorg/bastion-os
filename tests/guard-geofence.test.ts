import assert from 'node:assert/strict'
import test from 'node:test'

function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const R = 6_371_000
  const dLat = rad(lat2 - lat1)
  const dLon = rad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(R * c)
}

test('geofence distance calculation correctly measures meters', () => {
  // Lagos Victoria Island Site: 6.4281, 3.4219
  const siteLat = 6.4281
  const siteLon = 3.4219
  const radius = 100 // 100 meters

  // Point 1: At the same location (0 meters)
  const distZero = calculateDistanceMeters(siteLat, siteLon, siteLat, siteLon)
  assert.equal(distZero, 0)
  assert.ok(distZero <= radius)

  // Point 2: Slightly shifted (approx 30m away)
  const distNearby = calculateDistanceMeters(siteLat, siteLon, 6.4283, 3.4221)
  assert.ok(distNearby < 100, `Expected nearby distance under 100m, got ${distNearby}`)

  // Point 3: Far away (~1.5km away)
  const distFar = calculateDistanceMeters(siteLat, siteLon, 6.4400, 3.4300)
  assert.ok(distFar > 1000, `Expected far distance over 1000m, got ${distFar}`)
  const excess = Math.max(0, distFar - radius)
  assert.ok(excess > 900)
})

test('shift departure duration correctly counts elapsed minutes', () => {
  const departureTime = new Date('2026-11-06T10:00:00Z')
  const currentTime = new Date('2026-11-06T10:23:00Z')
  const minutesAway = Math.max(1, Math.round((currentTime.getTime() - departureTime.getTime()) / 60000))
  assert.equal(minutesAway, 23)

  // Critical escalation threshold test: >= 15 minutes is critical
  const severity = minutesAway >= 15 ? 'critical' : 'high'
  assert.equal(severity, 'critical')
})
