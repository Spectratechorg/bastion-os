import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { Client } from 'pg'

async function main() {
  const raw = process.env.DATABASE_URL
  if (!raw) throw new Error('DATABASE_URL is required. Run with: npm run db:backup')
  const url = new URL(raw)
  url.searchParams.delete('sslmode')
  const client = new Client({ connectionString: url.toString(), ssl: /localhost|127\.0\.0\.1/.test(raw) ? undefined : { rejectUnauthorized: false } })
  await client.connect()
  try {
    const { rows: tables } = await client.query<{ table_name: string }>(`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`)
    const data: Record<string, unknown[]> = {}
    for (const { table_name } of tables) {
      const result = await client.query(`select * from "${table_name.replace(/"/g, '""')}"`)
      data[table_name] = result.rows
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const dir = resolve(process.env.BACKUP_DIR || 'backups')
    await mkdir(dir, { recursive: true })
    const file = resolve(dir, `bastion-${stamp}.json.gz`)
    const payload = { createdAt: new Date().toISOString(), database: url.hostname, tables: Object.fromEntries(tables.map((table) => [table.table_name, data[table.table_name].length])), data }
    await writeFile(file, gzipSync(Buffer.from(JSON.stringify(payload))), { mode: 0o600 })
    console.log(JSON.stringify({ ok: true, file, tables: payload.tables }, null, 2))
  } finally {
    await client.end()
  }
}

main().catch((error) => { console.error('Backup failed:', error); process.exit(1) })
