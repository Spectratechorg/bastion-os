import { and, desc, eq, gte } from 'drizzle-orm'
import { db } from '@/lib/db'
import { attendance, guards, organizations, patrolCheckpoints, patrols } from '@/lib/db/schema'
import { currentShiftDate, guardShift, isShiftClosed, lagosParts, normalizeShift, patrolSlots, slotForHour } from '@/lib/server'

/** One guard's day so far: attendance, and which of the shift's hourly checkpoints are signed. Used by the guard app. */
export async function todayStatus(organizationId: string, guardId: string) {
  const now = lagosParts()
  const [[organization], [guard]] = await Promise.all([
    db.select({ startHour: organizations.patrolStartHour, endHour: organizations.patrolEndHour })
      .from(organizations).where(eq(organizations.id, organizationId)).limit(1),
    guardId === '00000000-0000-0000-0000-000000000000'
      ? Promise.resolve([])
      : db.select({ shiftStartHour: guards.shiftStartHour, shiftEndHour: guards.shiftEndHour }).from(guards).where(eq(guards.id, guardId)).limit(1),
  ])
  const shift = guardShift(guard ?? {}, normalizeShift(organization?.startHour, organization?.endHour))
  const shiftDate = currentShiftDate(now, shift)
  const slots = patrolSlots(shift)

  // One read covers the latest open attendance, the latest completed record and today's first sign-in.
  const [attendanceRows, checkpointRows] = await Promise.all([
    db.select({ checkedInAt: attendance.checkedInAt, checkedOutAt: attendance.checkedOutAt, inside: attendance.withinGeofence })
      .from(attendance)
      .where(and(eq(attendance.organizationId, organizationId), eq(attendance.guardId, guardId), gte(attendance.checkedInAt, new Date(Date.now() - 48 * 3600 * 1000))))
      .orderBy(desc(attendance.checkedInAt))
      .limit(200),
    db.select({ slot: patrolCheckpoints.slot, signedAt: patrolCheckpoints.signedAt })
      .from(patrolCheckpoints)
      .innerJoin(patrols, eq(patrolCheckpoints.patrolId, patrols.id))
      .where(and(eq(patrols.organizationId, organizationId), eq(patrols.guardId, guardId), eq(patrols.patrolDate, shiftDate))),
  ])

  const cutoff = new Date(Date.now() - 24 * 3600 * 1000)
  const latest = attendanceRows.find((row) => !row.checkedOutAt && row.checkedInAt >= cutoff) ?? attendanceRows.find((row) => row.checkedInAt >= cutoff)
  const morningRow = [...attendanceRows].reverse().find((row) => lagosParts(row.checkedInAt).date === shiftDate)
  const signed = Object.fromEntries(checkpointRows.map((row) => [row.slot, row.signedAt.toISOString()]))
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
