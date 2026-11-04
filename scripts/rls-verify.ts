import { randomUUID } from 'node:crypto'
import pg from 'pg'

/**
 * Proves the row-level security policies actually isolate organizations.
 *
 *   DATABASE_URL=<admin url> npm run db:rls-check
 *
 * The app normally connects as a role that is subject to RLS. This script creates a throwaway
 * non-superuser role, seeds two organizations, connects as that role, and asserts that:
 *   * no tenant context returns nothing,
 *   * a tenant context sees only its own rows,
 *   * cross-tenant inserts are rejected by WITH CHECK,
 *   * cross-tenant updates and deletes touch zero rows.
 *
 * The role and its rows are removed afterwards. Tables intentionally outside RLS (auth, config,
 * telemetry) are not part of the check; see docs/rls.md.
 */

const adminUrl = process.env.DATABASE_URL
if (!adminUrl) {
  console.error('DATABASE_URL is required (an admin connection that can create roles).')
  process.exit(1)
}

const role = `rls_check_${randomUUID().slice(0, 8)}`
const password = randomUUID()
const orgA = `rls-org-a-${randomUUID().slice(0, 8)}`
const orgB = `rls-org-b-${randomUUID().slice(0, 8)}`
const userA = `rls-user-a-${randomUUID().slice(0, 8)}`
const userB = `rls-user-b-${randomUUID().slice(0, 8)}`

const admin = new pg.Pool({ connectionString: adminUrl, max: 1 })
const checks: { name: string; ok: boolean; detail: string }[] = []

function check(name: string, ok: boolean, detail = '') {
  checks.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

function tenantUrl(url: string) {
  const parsed = new URL(url)
  parsed.username = role
  parsed.password = password
  return parsed.toString()
}

async function main() {
  console.log(`RLS verification using role ${role}\n`)
  await admin.query(`create role "${role}" login password '${password}' nosuperuser nobypassrls`)
  await admin.query(`grant usage on schema public to "${role}"`)
  await admin.query(`grant select, insert, update, delete on all tables in schema public to "${role}"`)
  await admin.query(`grant usage, select on all sequences in schema public to "${role}"`)
  await admin.query(`grant execute on function app_current_organization_id() to "${role}"`)

  await admin.query('insert into "user" (id, name, email, email_verified, created_at, updated_at) values ($1,$2,$3,true,now(),now()), ($4,$5,$6,true,now(),now())', [userA, 'RLS A', `${userA}@example.test`, userB, 'RLS B', `${userB}@example.test`])
  await admin.query('insert into organization (id, name, slug, created_at) values ($1,$2,$3,now()), ($4,$5,$6,now())', [orgA, 'RLS Org A', orgA, orgB, 'RLS Org B', orgB])
  await admin.query(
    `insert into guards (user_id, organization_id, name, nin, phone, initials, status, created_at)
     values ($1,$2,'Guard A1','NIN1','0700000001','GA','active',now()),
            ($3,$2,'Guard A2','NIN2','0700000002','GA','active',now()),
            ($1,$4,'Guard B1','NIN3','0700000003','GB','active',now())`,
    [userA, orgA, userB, orgB],
  )

  const app = new pg.Pool({ connectionString: tenantUrl(adminUrl as string), max: 1 })

  async function asTenant<T>(organizationId: string | null, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await app.connect()
    try {
      await client.query('begin')
      if (organizationId) await client.query("select set_config('app.organization_id', $1, true)", [organizationId])
      const result = await fn(client)
      await client.query('commit')
      return result
    } catch (error) {
      await client.query('rollback').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  }

  await asTenant(null, async (client) => {
    const { rows } = await client.query('select count(*)::int as n from guards')
    check('no tenant context returns no rows', rows[0].n === 0, `count=${rows[0].n}`)
  })

  await asTenant(orgA, async (client) => {
    const { rows } = await client.query('select organization_id, count(*)::int as n from guards group by 1')
    check('tenant A sees only its own rows', rows.length === 1 && rows[0].organization_id === orgA && rows[0].n === 2, JSON.stringify(rows))
  })

  await asTenant(orgA, async (client) => {
    const { rows } = await client.query("select count(*)::int as n from guards where organization_id = $1", [orgB])
    check('tenant A cannot see tenant B rows', rows[0].n === 0, `count=${rows[0].n}`)
  })

  await asTenant(orgA, async (client) => {
    let rejected = false
    try {
      await client.query("insert into guards (user_id, organization_id, name, nin, phone, initials, status, created_at) values ($1,$2,'Smuggled','NIN9','0700000009','SM','active',now())", [userA, orgB])
    } catch (error) {
      rejected = error instanceof Error && /row-level security|violates row-level security/i.test(error.message)
    }
    check('INSERT for another organization is rejected', rejected)
  })

  await asTenant(orgA, async (client) => {
    const updated = await client.query("update guards set name = 'hijacked' where organization_id = $1", [orgB])
    check('UPDATE for another organization touches zero rows', updated.rowCount === 0, `rowCount=${updated.rowCount}`)
    const deleted = await client.query('delete from guards where organization_id = $1', [orgB])
    check('DELETE for another organization touches zero rows', deleted.rowCount === 0, `rowCount=${deleted.rowCount}`)
  })

  await asTenant(orgB, async (client) => {
    const { rows } = await client.query('select name from guards order by name')
    check('tenant B sees only its own row', rows.length === 1 && rows[0].name === 'Guard B1', JSON.stringify(rows))
  })

  await asTenant(orgA, async (client) => {
    await client.query("insert into activity_events (user_id, organization_id, type, title, body, tone, created_at) values ($1,$2,'test','RLS test','insert allowed','neutral',now())", [userA, orgA])
    check('INSERT for the active organization succeeds', true)
  })

  await app.end()
}

async function cleanup() {
  try {
    // Delete tenant rows as admin, then drop the throwaway role.
    await admin.query('delete from activity_events where organization_id = any($1)', [[orgA, orgB]])
    await admin.query('delete from guards where organization_id = any($1)', [[orgA, orgB]])
    await admin.query('delete from organization where id = any($1)', [[orgA, orgB]])
    await admin.query('delete from "user" where id = any($1)', [[userA, userB]])
    await admin.query(`drop owned by "${role}"`).catch(() => undefined)
    await admin.query(`drop role if exists "${role}"`)
  } catch (error) {
    console.error('Cleanup issue:', error instanceof Error ? error.message : error)
  } finally {
    await admin.end()
  }
}

main()
  .catch((error) => {
    console.error('RLS verification failed:', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(async () => {
    await cleanup()
    const failed = checks.filter((entry) => !entry.ok)
    console.log(`\n${failed.length === 0 ? 'PASS' : 'FAIL'}  ${checks.length - failed.length}/${checks.length} checks passed`)
    if (failed.length > 0) process.exitCode = 1
  })
