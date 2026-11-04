import { count } from 'drizzle-orm'

import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'

/** Self-service registration is open only until the first account exists. */
export async function signUpOpen(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return true
  try {
    const [row] = await db.select({ n: count() }).from(users)
    return Number(row?.n ?? 0) === 0
  } catch {
    return false
  }
}
