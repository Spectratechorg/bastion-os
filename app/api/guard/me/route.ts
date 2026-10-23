import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guards } from '@/lib/db/schema'
import { todayStatus } from '@/lib/guard-today'
import { actor, fail } from '@/lib/server'

export const dynamic = 'force-dynamic'

/** The guard record linked to the signed-in login, with today's check-in and patrol progress. Used by the guard app. */
export async function GET() {
  const current = await actor(); if (!current) return fail('Sign in first.', 401)
  const [guard] = await db.select({ id: guards.id, name: guards.name, site: guards.site, photoUrl: guards.photoUrl, status: guards.status }).from(guards)
    .where(and(eq(guards.organizationId, current.organizationId), eq(guards.loginUserId, current.userId))).limit(1)
  if (!guard) {
    const { slots, shift, today, hour } = await todayStatus(current.organizationId, '00000000-0000-0000-0000-000000000000')
    return NextResponse.json({ linked: false, role: current.role, today, hour, slots, shift })
  }
  return NextResponse.json({ linked: true, role: current.role, guard, ...(await todayStatus(current.organizationId, guard.id)) })
}
