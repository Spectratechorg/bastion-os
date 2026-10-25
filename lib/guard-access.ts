import { randomInt } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { members, organizations } from '@/lib/db/schema'

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** Shared code a guard phone types once to use the guard app without a manager login. */
export function newGuardAppCode() {
  const pick = () => Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join('')
  return `GRD-${pick()}-${pick()}`
}

export const normalizeGuardAppCode = (code: string) => code.trim().toUpperCase().replace(/\s+/g, '')

export async function organizationForGuardAppCode(code: string) {
  const [organization] = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.guardAppCode, normalizeGuardAppCode(code)))
    .limit(1)
  return organization ?? null
}

/** Scan records are attributed to an organization administrator. */
export async function ownerUserId(organizationId: string) {
  const [membership] = await db
    .select({ userId: members.userId })
    .from(members)
    .where(eq(members.organizationId, organizationId))
    .limit(1)
  return membership?.userId ?? null
}
