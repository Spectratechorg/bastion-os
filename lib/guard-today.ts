import { and, desc, eq, gte, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { attendance, organizations, patrolCheckpoints, patrols } from '@/lib/db/schema'
import { currentShiftDate, lagosParts, normalizeShift, patrolSlots } from '@/lib/server'

/** One guard's day so far: attendance, and which of the shift's hourly checkpoints are signed. Used by the guard app. */
export async function todayStatus(organizationId: string, guardId: string) {
  const now = lagosParts()
  const [organization] = await db.select({ startHour: organizations.patrolStartHour, endHour: organizations.patrolEndHour })
    .from(organizations).where(eq(organizations.id, organizationId)).limit(1)
  const shift = normalizeShift(organization?.startHour, organization?.endHour)
  const shiftDate = currentShiftDate(now, shift)

  // Cutoff for attendance: 24 hours ago ensures shifts crossing midnight remain active
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000)

  // Look for currently open attendance first (not checked out), or the latest attendance record in the last 24h
  let [latest] = await db.select({ checkedInAt: attendance.checkedInAt, checkedOutAt: attendance.checkedOutAt, inside: attendance.withinGeofence })
    .from(attendance)
    .where(and(eq(attendance.organizationId, organizationId), eq(attendance.guardId, guardId), gte(attendance.checkedInAt, cutoff), isNull(attendance.checkedOutAt)))
    .orderBy(desc(attendance.checkedInAt))
    .limit(1)

  if (!latest) {
    ;[latest] = await db.select({ checkedInAt: attendance.checkedInAt, checkedOutAt: attendance.checkedOutAt, inside: attendance.withinGeofence })
      .from(attendance)
      .where(and(eq(attendance.organizationId, organizationId), eq(attendance.guardId, guardId), gte(attendance.checkedInAt, cutoff)))
      .orderBy(desc(attendance.checkedInAt))
      .limit(1)
  }

  // Find checkpoints for the current active shift (shiftDate)
  const rows = await db.select({ slot: patrolCheckpoints.slot, signedAt: patrolCheckpoints.signedAt })
    .from(patrolCheckpoints)
    .innerJoin(patrols, eq(patrolCheckpoints.patrolId, patrols.id))
    .where(and(
      eq(patrols.organizationId, organizationId),
      eq(patrols.guardId, guardId),
      eq(patrols.patrolDate, shiftDate),
    ))

  return {
    today: now.date,
    shiftDate,
    hour: now.hour,
    shift,
    slots: patrolSlots(shift),
    checkedInAt: latest?.checkedInAt ? latest.checkedInAt.toISOString() : null,
    checkedOutAt: latest?.checkedOutAt ? latest.checkedOutAt.toISOString() : null,
    insideGeofence: latest?.inside ?? null,
    signed: Object.fromEntries(rows.map((row) => [row.slot, row.signedAt.toISOString()])),
  }
}
