import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pool } from '../lib/db'

// Applies every drizzle/*.sql file in order. All files are idempotent, so this is safe to re-run.
async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set. Add it to .env.local first.')
  const dir = join(process.cwd(), 'drizzle')
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.sql')).sort()) {
    await pool.query(readFileSync(join(dir, file), 'utf8'))
    console.log(`applied ${file}`)
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(() => pool.end())
