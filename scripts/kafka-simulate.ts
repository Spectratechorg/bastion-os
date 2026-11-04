import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { produceGuardPingBatch, disconnectProducer } from '../lib/kafka/producer'
import { persistPingBatch } from '../lib/kafka/consumer'
import { db } from '../lib/db'
import { guards } from '../lib/db/schema'

const localEnvPath = resolve(process.cwd(), '.env.local')
if (existsSync(localEnvPath)) {
  process.loadEnvFile(localEnvPath)
}

/**
 * Simulates guard GPS pings.
 * Usage:
 *   tsx scripts/kafka-simulate.ts --direct   # directly tests database batch insertion
 *   tsx scripts/kafka-simulate.ts --kafka    # publishes to Kafka broker
 */
async function main() {
  const mode = process.argv.includes('--kafka') ? 'kafka' : 'direct'

  console.log(`[Simulator] Fetching available guards from Supabase...`)
  const allGuards = await db.select({ id: guards.id, name: guards.name, site: guards.site }).from(guards).limit(5)

  if (allGuards.length === 0) {
    console.log('[Simulator] No guards found in the database. Please register at least one guard or run db:seed.')
    process.exit(0)
  }

  console.log(`[Simulator] Found ${allGuards.length} guards. Generating simulated GPS pings around Lagos...`)

  // Base coordinates around Victoria Island, Lagos
  const baseLat = 6.4281
  const baseLng = 3.4219

  const simulatedPings = allGuards.map((g, idx) => ({
    guardId: g.id,
    latitude: baseLat + (Math.random() - 0.5) * 0.01,
    longitude: baseLng + (Math.random() - 0.5) * 0.01,
    batteryLevel: Math.floor(70 + Math.random() * 30),
    accuracy: 4.5,
    speed: +(Math.random() * 2).toFixed(2),
    timestamp: new Date().toISOString(),
  }))

  if (mode === 'kafka') {
    console.log(`[Simulator] Publishing ${simulatedPings.length} pings to Kafka topic...`)
    await produceGuardPingBatch(simulatedPings)
    await disconnectProducer()
    console.log(`[Simulator] Pings published successfully to Kafka!`)
  } else {
    console.log(`[Simulator] Direct mode: Testing batch persistence logic directly to Supabase...`)
    const result = await persistPingBatch(simulatedPings)
    console.log(
      `[Simulator] Result: Inserted ${result.insertedLocations} location records, updated ${result.updatedGuards} guards in Supabase.`
    )
  }

  process.exit(0)
}

main().catch((err) => {
  console.error('[Simulator] Error:', err)
  process.exit(1)
})
