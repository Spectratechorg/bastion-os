import { and, desc, eq, gte } from 'drizzle-orm'
import { db } from '@/lib/db'
import { attendance, organizations, patrolCheckpoints, patrols } from '@/lib/db/schema'
import { lagosParts, normalizeShift, patrolSlots } from '@/lib/server'

/** One guard's day so far: attendance, and which of the shift's hourly checkpoints are signed. Used by the guard app. */
export async function todayStatus(organizationId: string, guardId: string) {
  const now = lagosParts()
  const dayStart = new Date(`${now.date}T00:00:00+01:00`)
  const [organization] = await db.select({ startHour: organizations.patrolStartHour, endHour: organizations.patrolEndHour }).from(organizations).where(eq(organizations.id, organizationId)).limit(1)
  const shift = normalizeShift(organization?.startHour, organization?.endHour)
  const [latest] = await db.select({ checkedInAt: attendance.checkedInAt, checkedOutAt: attendance.checkedOutAt, inside: attendance.withinGeofence }).from(attendance)
    .where(and(eq(attendance.organizationId, organizationId), eq(attendance.guardId, guardId), gte(attendance.checkedInAt, dayStart))).orderBy(desc(attendance.checkedInAt)).limit(1)
  const rows = await db.select({ slot: patrolCheckpoints.slot, signedAt: patrolCheckpoints.signedAt }).from(patrolCheckpoints)
    .innerJoin(patrols, eq(patrolCheckpoints.patrolId, patrols.id))
    .where(and(eq(patrols.organizationId, organizationId), eq(patrols.guardId, guardId), eq(patrols.patrolDate, now.date)))
  return {
    today: now.date, hour: now.hour, shift, slots: patrolSlots(shift),
    checkedInAt: latest?.checkedInAt ?? null, checkedOutAt: latest?.checkedOutAt ?? null, insideGeofence: latest?.inside ?? null,
    signed: Object.fromEntries(rows.map((row) => [row.slot, row.signedAt])),
  }
}
