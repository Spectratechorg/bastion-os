import { NextResponse } from 'next/server'
import { and, desc, eq, gte } from 'drizzle-orm'
import { db } from '@/lib/db'
import { guards, organizations, patrolCheckpoints, patrols, sites } from '@/lib/db/schema'
import { actor, denyGuard, fail, lagosParts, normalizeShift, patrolSlots } from '@/lib/server'
import { raiseAlert } from '@/lib/alerts'

export const dynamic = 'force-dynamic'

/** Daily patrols (one per guard per day) with the hourly checkpoints from the organization shift. */
export async function GET(request: Request) {
  const current = await actor(); if (!current) return fail('Sign in and select an organization to view patrols.', 401)
  { const denied = denyGuard(current); if (denied) return denied }
  const now = lagosParts()
  const date = new URL(request.url).searchParams.get('date') ?? now.date
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail('Date must look like 2026-10-20')
  const since = new Date(Date.now() - 62 * 86400000)
  const [organization] = await db.select({ startHour: organizations.patrolStartHour, endHour: organizations.patrolEndHour })
    .from(organizations).where(eq(organizations.id, current.organizationId)).limit(1)
  const shift = normalizeShift(organization?.startHour, organization?.endHour)
  const slots = patrolSlots(shift)
  const [guardRows, siteRows, patrolRows, checkpointRows] = await Promise.all([
    db.select().from(guards).where(eq(guards.organizationId, current.organizationId)),
    db.select().from(sites).where(eq(sites.organizationId, current.organizationId)),
    db.select().from(patrols).where(and(eq(patrols.organizationId, current.organizationId), gte(patrols.loggedAt, since))).orderBy(desc(patrols.loggedAt)).limit(2000),
    db.select().from(patrolCheckpoints).where(and(eq(patrolCheckpoints.organizationId, current.organizationId), gte(patrolCheckpoints.signedAt, since))).limit(10000),
  ])
  const guardById = new Map(guardRows.map((guard) => [guard.id, guard])); const siteById = new Map(siteRows.map((site) => [site.id, site]))
  const signed = new Map<string, Record<string, string>>()
  for (const row of checkpointRows) signed.set(row.patrolId, { ...(signed.get(row.patrolId) ?? {}), [row.slot]: row.signedAt.toISOString() })
  const enriched = patrolRows.map((patrol) => {
    const day = patrol.patrolDate ?? lagosParts(patrol.loggedAt).date
    const checkpoints = signed.get(patrol.id) ?? {}
    const count = Object.keys(checkpoints).length
    const windowClosed = day < now.date || (day === now.date && now.hour >= shift.endHour)
    const status = count >= slots.length ? 'completed' : windowClosed ? 'missed' : 'in_progress'
    const guard = guardById.get(patrol.guardId)
    return { id: patrol.id, date: day, guardId: patrol.guardId, guardName: guard?.name ?? 'Unknown guard', photoUrl: guard?.photoUrl ?? null, site: (patrol.siteId && siteById.get(patrol.siteId)?.name) || guard?.site || '—', checkpoints, signedCount: count, status }
  })
  const today = enriched.filter((patrol) => patrol.date === now.date)
  const month = enriched.filter((patrol) => patrol.date.slice(0, 7) === now.month)
  const patrolled = new Set(today.map((patrol) => patrol.guardId))
  const notStarted = guardRows.filter((guard) => guard.status === 'active' && !patrolled.has(guard.id)).map((guard) => ({ guardId: guard.id, guardName: guard.name, site: guard.site ?? '—' }))
  // Once the shift has ended, raise one "missed patrol" alert per guard for today (idempotent).
  if (now.hour >= shift.endHour) {
    const missed = [...today.filter((patrol) => patrol.status === 'missed').map((patrol) => ({ id: patrol.guardId, name: patrol.guardName, site: patrol.site })), ...notStarted.map((guard) => ({ id: guard.guardId, name: guard.guardName, site: guard.site }))]
    for (const guard of missed) await raiseAlert({ userId: current.userId, organizationId: current.organizationId, type: 'patrol', title: 'Missed patrol', body: `${guard.name} did not complete all checkpoints at ${guard.site}`, severity: 'medium', key: `patrol:${guard.id}:${now.date}` })
  }
  return NextResponse.json({
    date, today: now.date, slots, shift,
    rows: enriched.filter((patrol) => patrol.date === date),
    notStarted: date === now.date ? notStarted : [],
    summary: {
      completedToday: today.filter((patrol) => patrol.status === 'completed').length,
      inProgressToday: today.filter((patrol) => patrol.status === 'in_progress').length,
      missedToday: today.filter((patrol) => patrol.status === 'missed').length + (now.hour >= shift.endHour ? notStarted.length : 0),
      completedThisMonth: month.filter((patrol) => patrol.status === 'completed').length,
    },
  })
}
