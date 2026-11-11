import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { alerts, activityEvents } from '@/lib/db/schema'
import { actor, can, denyGuard, fail } from '@/lib/server'
import { invalidate } from '@/lib/cache'

export const dynamic = 'force-dynamic'

/** Marks every open alert in the organization as acknowledged. */
export async function POST() {
  const current = await actor()
  if (!current) return fail('Sign in first.', 401)
  const denied = denyGuard(current); if (denied) return denied
  if (!(await can(current, 'manageIncidents'))) return fail('Your role cannot acknowledge alerts.', 403)
  const rows = await db.update(alerts).set({ acknowledged: true })
    .where(and(eq(alerts.organizationId, current.organizationId), eq(alerts.acknowledged, false)))
    .returning({ id: alerts.id })
  invalidate(`ops:${current.organizationId}:`); invalidate(`admin:${current.organizationId}`)
  if (rows.length > 0) {
    await db.insert(activityEvents).values({
      userId: current.userId, organizationId: current.organizationId, type: 'alert',
      title: `${rows.length} alert${rows.length === 1 ? '' : 's'} acknowledged`,
      body: 'A supervisor acknowledged all open alerts.', tone: 'neutral', createdAt: new Date(),
    })
  }
  return NextResponse.json({ ok: true, count: rows.length })
}
