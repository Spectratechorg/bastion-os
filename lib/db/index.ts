import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { schema } from './schema'

/**
 * One pool per server process, reused across requests. `max` is deliberately small because the app talks to Neon
 * through its pooled (pgbouncer) endpoint and each serverless instance only handles a few requests at a time.
 * A low idle timeout returns connections quickly instead of holding Neon compute awake.
 */
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 15_000,
  keepAlive: true,
})
export const db = drizzle(pool, { schema })
