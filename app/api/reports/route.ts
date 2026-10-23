import { and, eq, gte, lt, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { db } from '@/lib/db'
import { alerts, attendance, clients, finances, guards, incidents, organizations, patrolCheckpoints, patrols, payrollRecords, sites } from '@/lib/db/schema'
import { actor, can, denyGuard, fail, normalizeShift, patrolSlots } from '@/lib/server'

export const dynamic = 'force-dynamic'

/**
 * Headline numbers for the Reports page. Optional `from` / `to` (YYYY-MM-DD, Lagos days) limit every figure to that range;
 * without them the year to date is used for the finance summary and everything else counts all time.
 */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return fail('Database is not configured.', 503)
  const current = await actor(); if (!current) return fail('Unauthorized', 401)
  { const denied = denyGuard(current); if (denied) return denied }
  const params = new URL(request.url).searchParams
  const from = params.get('from'); const to = params.get('to')
  const okDate = (value: string | null) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value)
  if (!okDate(from) || !okDate(to)) return fail('Dates must look like 2026-10-31')
  const start = from ? new Date(`${from}T00:00:00+01:00`) : new Date(0)
  const end = to ? new Date(new Date(`${to}T00:00:00+01:00`).getTime() + 86400000) : new Date(Date.now() + 86400000)
  const organizationId = current.organizationId
  const showFinance = await can(current, 'viewFinance')
  const yearStart = new Date(new Date().getFullYear(), 0, 1)
  const financeStart = from ? start : yearStart
  const [organization] = await db.select({ startHour: organizations.patrolStartHour, endHour: organizations.patrolEndHour }).from(organizations).where(eq(organizations.id, organizationId)).limit(1)
  const slotCount = patrolSlots(normalizeShift(organization?.startHour, organization?.endHour)).length

  const [guardCounts, siteCounts, incidentCounts, clientCounts, attendanceCounts, alertCounts, patrolCounts, payrollCounts, financeRows, rangeGuards, rangeSites] = await Promise.all([
    db.select({ total: sql<number>`count(*)::int`, active: sql<number>`(count(*) filter (where ${guards.status} = 'active'))::int` }).from(guards).where(eq(guards.organizationId, organizationId)),
    db.select({ total: sql<number>`count(*)::int` }).from(sites).where(eq(sites.organizationId, organizationId)),
    db.select({ total: sql<number>`count(*)::int`, open: sql<number>`(count(*) filter (where ${incidents.status} != 'resolved'))::int`, resolved: sql<number>`(count(*) filter (where ${incidents.status} = 'resolved'))::int`, serious: sql<number>`(count(*) filter (where ${incidents.severity} in ('high','critical')))::int` })
      .from(incidents).where(and(eq(incidents.organizationId, organizationId), gte(incidents.reportedAt, start), lt(incidents.reportedAt, end))),
    db.select({ total: sql<number>`count(*)::int` }).from(clients).where(eq(clients.organizationId, organizationId)),
    db.select({ total: sql<number>`count(*)::int`, outside: sql<number>`(count(*) filter (where ${attendance.withinGeofence} = false))::int`, guards: sql<number>`count(distinct ${attendance.guardId})::int` })
      .from(attendance).where(and(eq(attendance.organizationId, organizationId), gte(attendance.checkedInAt, start), lt(attendance.checkedInAt, end))),
    db.select({ total: sql<number>`count(*)::int`, acknowledged: sql<number>`(count(*) filter (where ${alerts.acknowledged}))::int` })
      .from(alerts).where(and(eq(alerts.organizationId, organizationId), gte(alerts.createdAt, start), lt(alerts.createdAt, end))),
    db.select({
      total: sql<number>`count(*)::int`,
      completed: sql<number>`(count(*) filter (where (select count(*) from ${patrolCheckpoints} c where c.patrol_id = ${patrols.id}) >= ${slotCount}))::int`,
    }).from(patrols).where(and(eq(patrols.organizationId, organizationId), gte(patrols.loggedAt, start), lt(patrols.loggedAt, end))),
    showFinance
      ? db.select({ total: sql<number>`count(*)::int`, net: sql<number>`coalesce(sum(${payrollRecords.netPay}),0)::bigint` }).from(payrollRecords).where(and(eq(payrollRecords.organizationId, organizationId), gte(payrollRecords.createdAt, start), lt(payrollRecords.createdAt, end)))
      : Promise.resolve([{ total: null, net: null }]),
    showFinance ? db.select().from(finances).where(and(eq(finances.organizationId, organizationId), gte(finances.createdAt, financeStart), lt(finances.createdAt, end))).limit(5000) : Promise.resolve([]),
    db.select({ total: sql<number>`count(*)::int` }).from(guards).where(and(eq(guards.organizationId, organizationId), gte(guards.createdAt, start), lt(guards.createdAt, end))),
    db.select({ total: sql<number>`count(*)::int` }).from(sites).where(and(eq(sites.organizationId, organizationId), gte(sites.createdAt, start), lt(sites.createdAt, end))),
  ])

  const revenue = financeRows.filter((row) => ['revenue', 'invoice'].includes(row.kind)).reduce((sum, row) => sum + Number(row.amount), 0)
  const costs = financeRows.filter((row) => !['revenue', 'invoice'].includes(row.kind)).reduce((sum, row) => sum + Number(row.amount), 0)
  const pending = financeRows.filter((row) => !['paid', 'settled', 'received'].includes(row.status)).reduce((sum, row) => sum + Number(row.amount), 0)
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    periodStart: financeStart.toISOString(),
    range: { from, to },
    summary: {
      guards: { total: guardCounts[0]?.total ?? 0, active: guardCounts[0]?.active ?? 0 },
      sites: siteCounts[0]?.total ?? 0,
      incidents: { total: incidentCounts[0]?.total ?? 0, open: incidentCounts[0]?.open ?? 0 },
      clients: clientCounts[0]?.total ?? 0,
      finance: showFinance ? { revenue, costs, pending } : null,
    },
    guards: rangeGuards[0], sites: rangeSites[0],
    attendance: attendanceCounts[0], incidents: incidentCounts[0], alerts: alertCounts[0], patrols: patrolCounts[0], payroll: payrollCounts[0],
  })
}
