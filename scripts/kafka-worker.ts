import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createKafkaConsumer, getKafkaConfig } from '../lib/kafka/consumer'

const localEnvPath = resolve(process.cwd(), '.env.local')
if (existsSync(localEnvPath)) {
  process.loadEnvFile(localEnvPath)
}

async function main() {
  const config = getKafkaConfig()
  console.log('='.repeat(60))
  console.log('🚀 BastionOS Kafka Telemetry Worker')
  console.log('='.repeat(60))
  console.log(`Brokers  : ${config.brokers.join(', ')}`)
  console.log(`Topic    : ${config.topic}`)
  console.log(`Group ID : ${config.groupId}`)
  console.log(`DB Host  : ${process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).host : 'None'}`)
  console.log('='.repeat(60))

  try {
    const { stop } = await createKafkaConsumer()

    const handleShutdown = async (signal: string) => {
      console.log(`\n[Worker] Received ${signal}. Shutting down consumer gracefully...`)
      await stop()
      process.exit(0)
    }

    process.on('SIGINT', () => handleShutdown('SIGINT'))
    process.on('SIGTERM', () => handleShutdown('SIGTERM'))

    console.log('[Worker] Ingestion pipeline is active and listening for Kafka events.')
  } catch (err) {
    console.error('[Worker] Fatal error starting Kafka consumer:', err)
    process.exit(1)
  }
}

main().catch(console.error)
