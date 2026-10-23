import { and, eq, gte, lt, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { getActiveOrganization } from '@/lib/auth/organization'
import { db } from '@/lib/db'
import { attendance, clients, finances, guards, incidents, patrols, sites } from '@/lib/db/schema'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Operational report for an explicit date range (inclusive). Omitted dates default to the
 * current month, so the page can call /api/reports?from=2026-10-01&to=2026-10-21.
 */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: 'Database is not configured.' }, { status: 503 })
  const current = await getActiveOrganization()
  if (!current) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!current.organizationId) return NextResponse.json({ error: 'No active organization membership.' }, { status: 403 })

  const params = new URL(request.url).searchParams
  const now = new Date()
  const defaultFrom = `${now.toISOString().slice(0, 7)}-01`
  const defaultTo = now.toISOString().slice(0, 10)
  const fromText = params.get('from') ?? defaultFrom
  const toText = params.get('to') ?? defaultTo
  if (!ISO_DATE.test(fromText) || !ISO_DATE.test(toText)) return NextResponse.json({ error: 'Dates must look like 2026-10-01.' }, { status: 400 })
  if (fromText > toText) return NextResponse.json({ error: 'The start date must be on or before the end date.' }, { status: 400 })

  const organizationId = current.organizationId
  const from = new Date(`${fromText}T00:00:00.000Z`)
  const toExclusive = new Date(new Date(`${toText}T00:00:00.000Z`).getTime() + 86400000)

  const [guardCounts, siteCounts, incidentCounts, financeRows, clientCounts, attendanceCounts, patrolCounts] = await Promise.all([
    db.select({
      total: sql<number>`count(*)`,
      active: sql<number>`count(*) filter (where ${guards.status} = 'active')`,
    }).from(guards).where(eq(guards.organizationId, organizationId)),
    db.select({
      total: sql<number>`count(*)`,
      active: sql<number>`count(*) filter (where ${sites.status} = 'active')`,
    }).from(sites).where(eq(sites.organizationId, organizationId)),
    db.select({
      total: sql<number>`count(*)`,
      open: sql<number>`count(*) filter (where ${incidents.status} != 'resolved')`,
      reported: sql<number>`count(*) filter (where ${incidents.reportedAt} >= ${from.toISOString()} and ${incidents.reportedAt} < ${toExclusive.toISOString()})`,
    }).from(incidents).where(eq(incidents.organizationId, organizationId)),
    db.select().from(finances).where(and(
      eq(finances.organizationId, organizationId),
      gte(finances.createdAt, from),
      lt(finances.createdAt, toExclusive),
    )).limit(5000),
    db.select({ total: sql<number>`count(*)` }).from(clients).where(eq(clients.organizationId, organizationId)),
    db.select({
      checkIns: sql<number>`count(*)`,
      outsideGeofence: sql<number>`count(*) filter (where ${attendance.withinGeofence} = false)`,
      flagged: sql<number>`count(*) filter (where ${attendance.reviewStatus} = 'flagged')`,
      guardsSeen: sql<number>`count(distinct ${attendance.guardId})`,
    }).from(attendance).where(and(
      eq(attendance.organizationId, organizationId),
      gte(attendance.checkedInAt, from),
      lt(attendance.checkedInAt, toExclusive),
    )),
    db.select({
      total: sql<number>`count(*)`,
      completed: sql<number>`count(*) filter (where ${patrols.status} = 'completed')`,
      guardsSeen: sql<number>`count(distinct ${patrols.guardId})`,
    }).from(patrols).where(and(
      eq(patrols.organizationId, organizationId),
      gte(patrols.loggedAt, from),
      lt(patrols.loggedAt, toExclusive),
    )),
  ])

  const income = financeRows.filter((row) => ['revenue', 'invoice'].includes(row.kind))
  const costs = financeRows.filter((row) => !['revenue', 'invoice'].includes(row.kind))
  const settledStatuses = ['paid', 'settled', 'received']
  const total = (rows: typeof financeRows) => rows.reduce((sum, row) => sum + Number(row.amount), 0)
  const byCategory = new Map<string, number>()
  for (const row of costs) {
    const key = row.category || row.kind.replaceAll('_', ' ')
    byCategory.set(key, (byCategory.get(key) ?? 0) + Number(row.amount))
  }

  const attendanceRow = attendanceCounts[0]
  const patrolRow = patrolCounts[0]
  const patrolTotal = Number(patrolRow?.total ?? 0)
  const patrolCompleted = Number(patrolRow?.completed ?? 0)
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    from: fromText,
    to: toText,
    summary: {
      guards: { total: Number(guardCounts[0]?.total ?? 0), active: Number(guardCounts[0]?.active ?? 0) },
      sites: { total: Number(siteCounts[0]?.total ?? 0), active: Number(siteCounts[0]?.active ?? 0) },
      incidents: { total: Number(incidentCounts[0]?.total ?? 0), open: Number(incidentCounts[0]?.open ?? 0), reportedInRange: Number(incidentCounts[0]?.reported ?? 0) },
      clients: Number(clientCounts[0]?.total ?? 0),
      attendance: {
        checkIns: Number(attendanceRow?.checkIns ?? 0),
        outsideGeofence: Number(attendanceRow?.outsideGeofence ?? 0),
        flagged: Number(attendanceRow?.flagged ?? 0),
        guardsSeen: Number(attendanceRow?.guardsSeen ?? 0),
      },
      patrols: {
        total: patrolTotal,
        completed: patrolCompleted,
        guardsSeen: Number(patrolRow?.guardsSeen ?? 0),
        completionRate: patrolTotal ? Math.round((patrolCompleted / patrolTotal) * 100) : 0,
      },
      finance: {
        income: total(income),
        costs: total(costs),
        profit: total(income) - total(costs),
        unsettled: total(financeRows.filter((row) => !settledStatuses.includes(row.status))),
        incomeSettled: total(income.filter((row) => settledStatuses.includes(row.status))),
        records: financeRows.length,
        costByCategory: [...byCategory.entries()].sort((a, b) => b[1] - a[1]).map(([label, amount]) => ({ label, amount })),
      },
    },
  })
}
