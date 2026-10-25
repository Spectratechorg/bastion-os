import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'drizzle-kit'

const localEnvPath = resolve(process.cwd(), '.env.local')
if (!process.env.DATABASE_URL && existsSync(localEnvPath)) {
  process.loadEnvFile(localEnvPath)
}

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? '' },
})
