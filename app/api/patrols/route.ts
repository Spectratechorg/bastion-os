import { NextResponse } from 'next/server'
import { and, desc, eq, gte } from 'drizzle-orm'
import { db } from '@/lib/db'
import { attendance, guards, organizations, patrolCheckpoints, patrols, sites } from '@/lib/db/schema'
import { actor, currentShiftDate, denyGuard, fail, guardShift, isShiftClosed, lagosParts, normalizeShift, patrolSlots, slotForHour } from '@/lib/server'
import { raiseAlert } from '@/lib/alerts'
import { cachedJsonResponse } from '@/lib/cache'

export const dynamic = 'force-dynamic'

/**
 * Daily patrol board. Every guard is listed for the chosen day, even when they never scanned.
 * Each guard's own shift produces the expected hourly slots. A patrol is complete only when
 * every slot is signed; otherwise the unsigned slots that have passed are shown as missed.
 */
export async function GET(request: Request) {
  const current = await actor()
  if (!current) return fail('Sign in and select an organization to view patrols.', 401)
  { const denied = denyGuard(current); if (denied) return denied }
  const now = lagosParts()
  const date = new URL(request.url).searchParams.get('date') ?? now.date
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail('Date must look like 2026-10-20')
  return cachedJsonResponse(`patrols:${current.organizationId}:${date}`, 8_000, async () => {
    const since = new Date(Date.now() - 62 * 86400000)
    const [organization] = await db.select({ startHour: organizations.patrolStartHour, endHour: organizations.patrolEndHour })
      .from(organizations).where(eq(organizations.id, current.organizationId)).limit(1)
    const companyShift = normalizeShift(organization?.startHour, organization?.endHour)

    const [guardRows, siteRows, patrolRows, checkpointRows, attendanceRows] = await Promise.all([
      db.select().from(guards).where(eq(guards.organizationId, current.organizationId)),
      db.select().from(sites).where(eq(sites.organizationId, current.organizationId)),
      db.select().from(patrols).where(and(eq(patrols.organizationId, current.organizationId), gte(patrols.loggedAt, since))).orderBy(desc(patrols.loggedAt)).limit(5000),
      db.select().from(patrolCheckpoints).where(and(eq(patrolCheckpoints.organizationId, current.organizationId), gte(patrolCheckpoints.signedAt, since))).limit(20000),
      db.select({ guardId: attendance.guardId, checkedInAt: attendance.checkedInAt })
        .from(attendance)
        .where(and(eq(attendance.organizationId, current.organizationId), gte(attendance.checkedInAt, new Date(Date.now() - 48 * 3600 * 1000))))
        .orderBy(attendance.checkedInAt),
    ])

    const siteById = new Map(siteRows.map((site) => [site.id, site]))
    const signed = new Map<string, Record<string, string>>()
    for (const row of checkpointRows) {
      signed.set(row.patrolId, { ...(signed.get(row.patrolId) ?? {}), [row.slot]: row.signedAt.toISOString() })
    }
    const patrolByGuard = new Map(patrolRows.filter((patrol) => (patrol.patrolDate ?? lagosParts(patrol.loggedAt).date) === date).map((patrol) => [patrol.guardId, patrol]))
    const morningByGuard = new Map<string, Date>()
    for (const row of attendanceRows) {
      if (lagosParts(row.checkedInAt).date === date && !morningByGuard.has(row.guardId)) morningByGuard.set(row.guardId, row.checkedInAt)
    }

    const rows = guardRows.map((guard) => {
      const shift = guardShift(guard, companyShift)
      const slots = patrolSlots(shift)
      const patrol = patrolByGuard.get(guard.id)
      const checkpoints = patrol ? signed.get(patrol.id) ?? {} : {}
      const signedCount = Object.keys(checkpoints).length
      const closed = isShiftClosed(date, now, shift)
      const currentSlot = date === now.date ? slotForHour(now.hour, shift) : null
      const currentIndex = currentSlot ? slots.indexOf(currentSlot) : -1
      const missedSlots = slots.filter((slot, index) => {
        if (checkpoints[slot]) return false
        if (closed) return true
        if (date < now.date) return true
        if (date > now.date) return false
        return currentIndex >= 0 && index < currentIndex
      })
      const status = signedCount >= slots.length ? 'completed' : missedSlots.length ? 'missed' : 'in_progress'
      return {
        id: patrol?.id ?? `guard:${guard.id}:${date}`,
        date,
        guardId: guard.id,
        guardName: guard.name,
        photoUrl: guard.photoUrl,
        site: (patrol?.siteId && siteById.get(patrol.siteId)?.name) || guard.site || '—',
        status: guard.status === 'suspended' ? 'suspended' : status,
        shift,
        slots,
        checkpoints,
        signedCount,
        missedSlots,
        morningSignedAt: morningByGuard.get(guard.id)?.toISOString() ?? null,
      }
    })

    const completed = rows.filter((row) => row.status === 'completed').length
    const missed = rows.filter((row) => row.status === 'missed').length
    const inProgress = rows.filter((row) => row.status === 'in_progress').length
    const month = patrolRows.filter((patrol) => (patrol.patrolDate ?? lagosParts(patrol.loggedAt).date).slice(0, 7) === now.month)
    const completedThisMonth = month.filter((patrol) => {
      const guard = guardRows.find((item) => item.id === patrol.guardId)
      const slots = patrolSlots(guardShift(guard ?? {}, companyShift))
      return Object.keys(signed.get(patrol.id) ?? {}).length >= slots.length
    }).length

    // Alerts are only raised for today, once per guard, and never for suspended guards.
    if (date === now.date) {
      for (const guard of guardRows.filter((item) => item.status !== 'suspended')) {
        const row = rows.find((item) => item.guardId === guard.id)
        if (!row) continue
        if (now.hour >= 8 && !morningByGuard.has(guard.id)) {
          await raiseAlert({
            userId: current.userId,
            organizationId: current.organizationId,
            type: 'attendance',
            title: 'Missed morning sign-in',
            body: `${guard.name} did not sign in by 08:00${guard.site ? ` at ${guard.site}` : ''}`,
            severity: 'high',
            key: `morning:${guard.id}:${date}`,
          })
        }
        if (isShiftClosed(date, now, row.shift) && row.missedSlots.length > 0) {
          await raiseAlert({
            userId: current.userId,
            organizationId: current.organizationId,
            type: 'patrol',
            title: 'Missed patrol',
            body: `${guard.name} missed ${row.missedSlots.join(', ')}${guard.site ? ` at ${guard.site}` : ''}`,
            severity: 'medium',
            key: `patrol:${guard.id}:${date}`,
          })
        }
      }
    }

    return NextResponse.json({
      date,
      today: now.date,
      rows,
      summary: { completed, inProgress, missed, total: rows.length, completedThisMonth },
    })
  })
}
