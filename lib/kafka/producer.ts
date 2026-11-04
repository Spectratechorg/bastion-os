import { Kafka, Producer } from 'kafkajs'
import { GuardPing, GuardPingSchema } from './types'
import { getKafkaConfig, KafkaConsumerOptions } from './consumer'

let singletonProducer: Producer | null = null

export async function getKafkaProducer(options?: KafkaConsumerOptions): Promise<Producer> {
  if (singletonProducer) return singletonProducer

  const config = getKafkaConfig(options)
  const kafka = new Kafka({
    clientId: `${config.clientId}-producer`,
    brokers: config.brokers,
  })

  singletonProducer = kafka.producer()
  await singletonProducer.connect()
  return singletonProducer
}

/**
 * Publishes a single guard GPS ping to the Kafka topic.
 */
export async function produceGuardPing(ping: GuardPing, options?: KafkaConsumerOptions): Promise<void> {
  const validated = GuardPingSchema.parse(ping)
  const producer = await getKafkaProducer(options)
  const config = getKafkaConfig(options)

  await producer.send({
    topic: config.topic,
    messages: [
      {
        key: validated.guardId,
        value: JSON.stringify(validated),
      },
    ],
  })
}

/**
 * Publishes a batch of guard GPS pings to the Kafka topic.
 */
export async function produceGuardPingBatch(pings: GuardPing[], options?: KafkaConsumerOptions): Promise<void> {
  const validatedPings = pings.map((p) => GuardPingSchema.parse(p))
  const producer = await getKafkaProducer(options)
  const config = getKafkaConfig(options)

  await producer.send({
    topic: config.topic,
    messages: validatedPings.map((p) => ({
      key: p.guardId,
      value: JSON.stringify(p),
    })),
  })
}

export async function disconnectProducer(): Promise<void> {
  if (singletonProducer) {
    await singletonProducer.disconnect()
    singletonProducer = null
  }
}
