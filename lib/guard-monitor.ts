import { and, eq, gte } from 'drizzle-orm'
import { db } from '@/lib/db'
import { attendance, guards, organizations, patrolCheckpoints, patrols } from '@/lib/db/schema'
import { raiseAlert } from '@/lib/alerts'
import { currentShiftDate, guardShift, isShiftClosed, lagosParts, normalizeShift, patrolSlots } from '@/lib/server'

const since = () => new Date(Date.now() - 72 * 3600 * 1000)

/**
 * Background guard monitor. Safe to run repeatedly: alert dedupe keys prevent duplicate rows.
 * It catches morning no-shows and patrols that closed without every checkpoint signed.
 */
export async function runGuardMonitor() {
  const now = lagosParts()
  const orgs = await db.select({ id: organizations.id, startHour: organizations.patrolStartHour, endHour: organizations.patrolEndHour }).from(organizations)
  let morningAlerts = 0
  let patrolAlerts = 0
  let guardsChecked = 0

  for (const org of orgs) {
    const [guardRows, attendanceRows, patrolRows, checkpointRows] = await Promise.all([
      db.select().from(guards).where(eq(guards.organizationId, org.id)),
      db.select({ guardId: attendance.guardId, checkedInAt: attendance.checkedInAt })
        .from(attendance).where(and(eq(attendance.organizationId, org.id), gte(attendance.checkedInAt, since()))),
      db.select().from(patrols).where(and(eq(patrols.organizationId, org.id), gte(patrols.loggedAt, since()))),
      db.select({ patrolId: patrolCheckpoints.patrolId, slot: patrolCheckpoints.slot })
        .from(patrolCheckpoints).where(and(eq(patrolCheckpoints.organizationId, org.id), gte(patrolCheckpoints.signedAt, since()))),
    ])

    const companyShift = normalizeShift(org.startHour, org.endHour)
    const morningSigned = new Set(attendanceRows.filter((row) => lagosParts(row.checkedInAt).date === now.date).map((row) => row.guardId))
    const signed = new Map<string, Set<string>>()
    for (const checkpoint of checkpointRows) {
      const slots = signed.get(checkpoint.patrolId) ?? new Set<string>()
      slots.add(checkpoint.slot)
      signed.set(checkpoint.patrolId, slots)
    }
    const patrolByGuardDate = new Map(patrolRows.map((patrol) => [`${patrol.guardId}:${patrol.patrolDate ?? lagosParts(patrol.loggedAt).date}`, patrol]))

    for (const guard of guardRows) {
      if (guard.status === 'suspended') continue
      guardsChecked += 1
      const shift = guardShift(guard, companyShift)

      if (now.hour >= 8 && !morningSigned.has(guard.id)) {
        const raised = await raiseAlert({
          userId: guard.userId,
          organizationId: org.id,
          type: 'attendance',
          title: 'Missed morning sign-in',
          body: `${guard.name} did not sign in by 08:00${guard.site ? ` at ${guard.site}` : ''}`,
          severity: 'high',
          key: `morning:${guard.id}:${now.date}`,
        })
        if (raised) morningAlerts += 1
      }

      const shiftDate = currentShiftDate(now, shift)
      const patrol = patrolByGuardDate.get(`${guard.id}:${shiftDate}`)
      const slots = patrolSlots(shift)
      const patrolSigned = patrol ? signed.get(patrol.id) ?? new Set<string>() : new Set<string>()
      const missed = slots.filter((slot) => !patrolSigned.has(slot))
      if (isShiftClosed(shiftDate, now, shift) && missed.length > 0) {
        const raised = await raiseAlert({
          userId: guard.userId,
          organizationId: org.id,
          type: 'patrol',
          title: 'Missed patrol',
          body: `${guard.name} missed ${missed.join(', ')}${guard.site ? ` at ${guard.site}` : ''}`,
          severity: 'medium',
          key: `patrol:${guard.id}:${shiftDate}`,
        })
        if (raised) patrolAlerts += 1
      }
    }
  }

  return { organizations: orgs.length, guardsChecked, morningAlerts, patrolAlerts, checkedAt: new Date().toISOString() }
}
