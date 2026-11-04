import { Kafka, Consumer, EachBatchPayload } from 'kafkajs'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { guardLocations, guards } from '../db/schema'
import { GuardPingSchema, GuardPing, ProcessedPingResult } from './types'

export interface KafkaConsumerOptions {
  brokers?: string[]
  clientId?: string
  groupId?: string
  topic?: string
}

/**
 * Parses environment or options to get Kafka configuration.
 */
export function getKafkaConfig(options?: KafkaConsumerOptions) {
  const brokersEnv = process.env.KAFKA_BROKERS || 'localhost:9092'
  const brokers = options?.brokers || brokersEnv.split(',').map((b) => b.trim())
  const clientId = options?.clientId || process.env.KAFKA_CLIENT_ID || 'bastion-os-ingestor'
  const groupId = options?.groupId || process.env.KAFKA_GROUP_ID || 'bastion-guard-pings'
  const topic = options?.topic || process.env.KAFKA_TOPIC || 'guard-gps-pings'

  return { brokers, clientId, groupId, topic }
}

/**
 * Processes a list of raw validated pings in a batch:
 * 1. Bulk inserts into guard_locations table.
 * 2. Updates guards table with the latest latitude, longitude, and lastCheckIn.
 */
export async function persistPingBatch(pings: GuardPing[]): Promise<ProcessedPingResult> {
  if (pings.length === 0) {
    return { insertedLocations: 0, updatedGuards: 0, errors: 0 }
  }

  const now = new Date()
  const locationRows = pings.map((p) => {
    const recordedAt = p.timestamp ? new Date(p.timestamp) : now
    return {
      guardId: p.guardId,
      organizationId: p.organizationId ?? null,
      siteId: p.siteId ?? null,
      latitude: p.latitude,
      longitude: p.longitude,
      batteryLevel: p.batteryLevel ?? null,
      accuracy: p.accuracy ?? null,
      speed: p.speed ?? null,
      source: 'kafka',
      recordedAt,
      createdAt: now,
    }
  })

  // 1. Bulk insert all location records into Supabase Postgres
  let inserted = 0
  try {
    await db.insert(guardLocations).values(locationRows)
    inserted = locationRows.length
  } catch (err) {
    console.error('[Kafka Consumer] Error bulk inserting guard_locations:', err)
  }

  // 2. Update the guards table for each guard's most recent position
  // Group by guardId so we only update each guard with their latest ping in this batch
  const latestByGuard = new Map<string, GuardPing>()
  for (const p of pings) {
    latestByGuard.set(p.guardId, p)
  }

  let updated = 0
  for (const [guardId, latest] of latestByGuard.entries()) {
    try {
      const recordedAt = latest.timestamp ? new Date(latest.timestamp) : now
      await db
        .update(guards)
        .set({
          lastLatitude: latest.latitude,
          lastLongitude: latest.longitude,
          lastCheckIn: recordedAt,
        })
        .where(eq(guards.id, guardId))
      updated++
    } catch (err) {
      console.error(`[Kafka Consumer] Failed to update guard ${guardId}:`, err)
    }
  }

  return { insertedLocations: inserted, updatedGuards: updated, errors: 0 }
}

/**
 * Starts the Kafka consumer with batch processing (eachBatch).
 */
export async function createKafkaConsumer(options?: KafkaConsumerOptions): Promise<{
  consumer: Consumer
  stop: () => Promise<void>
}> {
  const config = getKafkaConfig(options)

  const kafka = new Kafka({
    clientId: config.clientId,
    brokers: config.brokers,
  })

  const consumer = kafka.consumer({ groupId: config.groupId })

  console.log(`[Kafka Consumer] Connecting to brokers: ${config.brokers.join(', ')}...`)
  await consumer.connect()
  console.log(`[Kafka Consumer] Connected. Subscribing to topic: ${config.topic}`)
  await consumer.subscribe({ topic: config.topic, fromBeginning: false })

  await consumer.run({
    eachBatch: async ({ batch, resolveOffset, heartbeat, isRunning, isStale }: EachBatchPayload) => {
      const validPings: GuardPing[] = []

      for (const message of batch.messages) {
        if (!isRunning() || isStale()) break
        if (!message.value) continue

        try {
          const rawPayload = JSON.parse(message.value.toString())
          const validated = GuardPingSchema.parse(rawPayload)
          validPings.push(validated)
        } catch (parseError) {
          console.error('[Kafka Consumer] Invalid ping message rejected:', parseError)
        }

        resolveOffset(message.offset)
      }

      if (validPings.length > 0) {
        const result = await persistPingBatch(validPings)
        console.log(
          `[Kafka Consumer] Batch processed: ${result.insertedLocations} locations inserted, ${result.updatedGuards} guards updated.`
        )
      }

      await heartbeat()
    },
  })

  const stop = async () => {
    console.log('[Kafka Consumer] Disconnecting...')
    await consumer.disconnect()
    console.log('[Kafka Consumer] Disconnected successfully.')
  }

  return { consumer, stop }
}
