import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { schema } from './schema'

/**
 * One pool per server process, reused across requests. `max` is deliberately small because the app talks to
 * the database through its pooled (pgbouncer) endpoint and each serverless instance only handles a few requests at a time.
 * A low idle timeout returns connections quickly instead of holding compute awake.
 */
const rawUrl = process.env.DATABASE_URL ?? ''
const isLocal = !rawUrl || rawUrl.includes('localhost') || rawUrl.includes('127.0.0.1')
/**
 * Managed Postgres poolers (Supabase/Supavisor) present a certificate `pg` 8.23 rejects when the URL
 * carries `sslmode=require`. Strip the URL's SSL mode and set it explicitly; local databases stay plain.
 */
const connectionString = isLocal ? rawUrl : rawUrl.replace(/[?&](sslmode|uselibpqcompat)=[^&]+/g, '').replace(/\?$/, '')

export const pool = new Pool({
  connectionString,
  max: 5,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 15_000,
  keepAlive: true,
  ssl: isLocal ? false : { rejectUnauthorized: false },
})

export const db = drizzle(pool, { schema })
