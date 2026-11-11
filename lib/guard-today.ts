import { and, desc, eq, gte, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { attendance, guards, organizations, patrolCheckpoints, patrols } from '@/lib/db/schema'
import { currentShiftDate, guardShift, isShiftClosed, lagosParts, normalizeShift, patrolSlots, slotForHour } from '@/lib/server'

/** One guard's day so far: attendance, and which of the shift's hourly checkpoints are signed. Used by the guard app. */
export async function todayStatus(organizationId: string, guardId: string) {
  const now = lagosParts()
  const [organization] = await db.select({ startHour: organizations.patrolStartHour, endHour: organizations.patrolEndHour })
    .from(organizations).where(eq(organizations.id, organizationId)).limit(1)
  const [guard] = guardId === '00000000-0000-0000-0000-000000000000'
    ? []
    : await db.select({ shiftStartHour: guards.shiftStartHour, shiftEndHour: guards.shiftEndHour }).from(guards).where(eq(guards.id, guardId)).limit(1)
  const shift = guardShift(guard ?? {}, normalizeShift(organization?.startHour, organization?.endHour))
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

  // Morning sign-in is the first attendance record for this duty date. The deadline is fixed at 08:00.
  const recentAttendance = await db.select({ checkedInAt: attendance.checkedInAt })
    .from(attendance)
    .where(and(eq(attendance.organizationId, organizationId), eq(attendance.guardId, guardId), gte(attendance.checkedInAt, new Date(Date.now() - 48 * 3600 * 1000))))
    .orderBy(attendance.checkedInAt)
  const morningRow = recentAttendance.find((row) => lagosParts(row.checkedInAt).date === shiftDate)

  // Find checkpoints for the current active shift (shiftDate)
  const rows = await db.select({ slot: patrolCheckpoints.slot, signedAt: patrolCheckpoints.signedAt })
    .from(patrolCheckpoints)
    .innerJoin(patrols, eq(patrolCheckpoints.patrolId, patrols.id))
    .where(and(
      eq(patrols.organizationId, organizationId),
      eq(patrols.guardId, guardId),
      eq(patrols.patrolDate, shiftDate),
    ))

  const slots = patrolSlots(shift)
  const signed = Object.fromEntries(rows.map((row) => [row.slot, row.signedAt.toISOString()]))
  const closed = isShiftClosed(shiftDate, now, shift)
  const currentSlot = slotForHour(now.hour, shift)
  const currentIndex = currentSlot ? slots.indexOf(currentSlot) : -1
  const missedSlots = slots.filter((slot, index) => !signed[slot] && (closed || (currentIndex >= 0 && index < currentIndex)))

  return {
    today: now.date,
    shiftDate,
    hour: now.hour,
    shift,
    slots,
    closed,
    missedSlots,
    checkedInAt: latest?.checkedInAt ? latest.checkedInAt.toISOString() : null,
    checkedOutAt: latest?.checkedOutAt ? latest.checkedOutAt.toISOString() : null,
    insideGeofence: latest?.inside ?? null,
    morning: {
      deadline: '08:00',
      signedAt: morningRow?.checkedInAt ? morningRow.checkedInAt.toISOString() : null,
      late: morningRow ? lagosParts(morningRow.checkedInAt).hour >= 8 : false,
      missed: !morningRow && now.hour >= 8,
    },
    signed,
  }
}
