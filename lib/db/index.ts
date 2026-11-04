import { AsyncLocalStorage } from 'node:async_hooks'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool, type PoolClient } from 'pg'
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

export type TenantDb = NodePgDatabase<typeof schema>

/** The unscoped handle. Only auth/config paths and seed scripts may use it once RLS is on. */
export const baseDb: TenantDb = drizzle(pool, { schema })

type TenantScope = { db: TenantDb; client: PoolClient }
const tenantScope = new AsyncLocalStorage<TenantScope>()

/**
 * Every business query goes through this handle. Inside `withTenant()` it resolves to a Drizzle
 * instance bound to that request's transaction, so Postgres row-level security sees
 * `app.organization_id`. Outside a tenant scope it falls back to the pool, where the RLS policies
 * return nothing for tenant tables — a safe failure that surfaces missing scopes in tests.
 */
export const db: TenantDb = new Proxy(baseDb, {
  get(target, property, receiver) {
    const scoped = tenantScope.getStore()
    const source = (scoped?.db ?? target) as unknown as Record<PropertyKey, unknown>
    const value = Reflect.get(source, property, receiver)
    return typeof value === 'function' ? value.bind(source) : value
  },
}) as TenantDb

/** Raw client for the current tenant transaction (raw SQL still needs the same connection). */
export function currentClient(): PoolClient {
  const scope = tenantScope.getStore()
  if (!scope) throw new Error('No tenant context. Wrap the handler in withTenant().')
  return scope.client
}

/**
 * Runs `fn` inside a transaction whose connection has `app.organization_id` set for its duration
 * (`SET LOCAL`). Every RLS policy compares against that setting, so the whole request is scoped
 * without repeating `organization_id = ...` in each query.
 */
/**
 * RLS only applies to roles that do not bypass it. Since the manual `organization_id` filters were
 * removed, continuing as a superuser would silently expose every tenant, so refuse to scope a
 * request unless enforcement is real. Set RLS_ALLOW_BYPASS=true only for a single-tenant local
 * database where that trade-off is understood.
 */
let enforcementCheck: Promise<boolean> | null = null
function assertRlsEnforced(client: PoolClient): Promise<boolean> {
  enforcementCheck ??= client.query<{ bypasses: boolean }>(
    'select (rolsuper or rolbypassrls) as bypasses from pg_roles where rolname = current_user',
  ).then((result) => {
    const bypasses = Boolean(result.rows[0]?.bypasses)
    if (bypasses && process.env.RLS_ALLOW_BYPASS !== 'true') {
      throw new Error(
        'The database role bypasses row-level security (superuser or BYPASSRLS). Use a normal role for DATABASE_URL, '
        + 'or set RLS_ALLOW_BYPASS=true for a single-tenant local database.',
      )
    }
    return !bypasses
  })
  return enforcementCheck
}

export async function withTenant<T>(organizationId: string, fn: () => Promise<T>): Promise<T> {
  const existing = tenantScope.getStore()
  if (existing) return fn() // already scoped: reuse the request transaction instead of nesting one

  const client = await pool.connect()
  let committed = false
  try {
    await assertRlsEnforced(client)
    await client.query('begin')
    await client.query("select set_config('app.organization_id', $1, true)", [organizationId])
    const scoped = drizzle(client, { schema })
    const result = await tenantScope.run({ db: scoped, client }, fn)
    await client.query('commit')
    committed = true
    return result
  } catch (error) {
    if (!committed) await client.query('rollback').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}
