import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { schema } from './schema'

/**
 * One pool per server process, reused across requests. `max` is deliberately small because the app talks to
 * the database through its pooled (pgbouncer) endpoint and each serverless instance only handles a few requests at a time.
 * A low idle timeout returns connections quickly instead of holding compute awake.
 */
const isLocal = !process.env.DATABASE_URL || process.env.DATABASE_URL.includes('localhost') || process.env.DATABASE_URL.includes('127.0.0.1')

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 15_000,
  keepAlive: true,
  ssl: isLocal ? false : { rejectUnauthorized: false },
})

export const db = drizzle(pool, { schema })
