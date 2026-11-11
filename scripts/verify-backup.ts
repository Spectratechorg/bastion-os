import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { Client } from 'pg'

type Backup = { createdAt: string; tables: Record<string, number>; data: Record<string, unknown[]> }

async function main() {
  const dir = resolve(process.env.BACKUP_DIR || 'backups')
  const selected = process.argv[2]
  const file = selected ? resolve(selected) : resolve(dir, (await readdir(dir)).filter((name) => name.endsWith('.json.gz')).sort().at(-1) || '')
  if (!file) throw new Error('No backup file found.')
  const backup = JSON.parse(gunzipSync(await readFile(file)).toString()) as Backup
  const raw = process.env.DATABASE_URL
  if (!raw) throw new Error('DATABASE_URL is required.')
  const url = new URL(raw); url.searchParams.delete('sslmode')
  const client = new Client({ connectionString: url.toString(), ssl: /localhost|127\.0\.0\.1/.test(raw) ? undefined : { rejectUnauthorized: false } })
  await client.connect()
  try {
    const mismatches: string[] = []
    const liveDrift: string[] = []
    await client.query('begin')
    try {
      for (const [table, expected] of Object.entries(backup.tables)) {
        const quoted = table.replace(/"/g, '""')
        const { rows } = await client.query(`select count(*)::int as count from "${quoted}"`)
        const actual = Number(rows[0]?.count ?? 0)
        if (actual !== expected) liveDrift.push(`${table}: backup ${expected}, live ${actual}`)
        const rowsInBackup = backup.data[table] ?? []
        await client.query(`create temp table "${quoted}_restore_check" as select * from "${quoted}" with no data`)
        if (rowsInBackup.length) {
          await client.query(`insert into "${quoted}_restore_check" select * from json_populate_recordset(null::"${quoted}", $1::json)`, [JSON.stringify(rowsInBackup)])
        }
        const restored = await client.query(`select count(*)::int as count from "${quoted}_restore_check"`)
        if (Number(restored.rows[0]?.count ?? 0) !== rowsInBackup.length) mismatches.push(`${table}: restore simulation mismatch`)
      }
      await client.query('rollback')
    } catch (error) {
      await client.query('rollback').catch(() => undefined)
      throw error
    }
    console.log(JSON.stringify({ ok: mismatches.length === 0, file, createdAt: backup.createdAt, tables: Object.keys(backup.tables).length, restoreSimulation: true, mismatches, liveDrift }, null, 2))
    if (mismatches.length) process.exitCode = 1
  } finally { await client.end() }
}

main().catch((error) => { console.error('Backup verification failed:', error); process.exit(1) })
