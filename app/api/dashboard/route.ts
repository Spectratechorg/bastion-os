import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { and, desc, eq, sql } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { alerts, activityEvents, attendance, finances, guards, incidents, patrols } from '@/lib/db/schema'

async function resolveOrganizationId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null
  return (session.session as { activeOrganizationId?: string } | undefined)?.activeOrganizationId ?? null
}

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const organizationId = await resolveOrganizationId()
  if (!organizationId) return NextResponse.json({ error: 'No active organization. Create or join an organization before using the dashboard.' }, { status: 403 })
  const userId = session.user.id
  const [guardRows, incidentRows, alertRows, activityRows, attendanceRows, counts, patrolRows, financeRows] = await Promise.all([
    db.select().from(guards).where(and(eq(guards.organizationId, organizationId), eq(guards.userId, userId))).orderBy(desc(guards.lastCheckIn)).limit(8),
    db.select().from(incidents).where(and(eq(incidents.organizationId, organizationId), eq(incidents.userId, userId), eq(incidents.status, 'open'))).orderBy(desc(incidents.reportedAt)).limit(5),
    db.select().from(alerts).where(and(eq(alerts.organizationId, organizationId), eq(alerts.userId, userId), eq(alerts.acknowledged, false))).orderBy(desc(alerts.createdAt)).limit(5),
    db.select().from(activityEvents).where(and(eq(activityEvents.organizationId, organizationId), eq(activityEvents.userId, userId))).orderBy(desc(activityEvents.createdAt)).limit(8),
    db.select().from(attendance).where(and(eq(attendance.organizationId, organizationId), eq(attendance.userId, userId))).orderBy(desc(attendance.checkedInAt)).limit(100),
    db.select({ total: sql<number>`count(*)`, active: sql<number>`count(*) filter (where ${guards.status} = 'active')` }).from(guards).where(and(eq(guards.organizationId, organizationId), eq(guards.userId, userId))),
    db.select().from(patrols).where(and(eq(patrols.organizationId, organizationId), eq(patrols.userId, userId))).orderBy(desc(patrols.loggedAt)).limit(500),
    db.select().from(finances).where(and(eq(finances.organizationId, organizationId), eq(finances.userId, userId))).limit(500),
  ])
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const todayAttendance = attendanceRows.filter((row) => row.checkedInAt >= today).length
  const todayPatrols = patrolRows.filter((row) => row.loggedAt >= today)
  const revenueYtd = financeRows.filter((row) => row.kind === 'revenue' && row.status === 'paid').reduce((sum, row) => sum + Number(row.amount), 0)
  const operatingCostYtd = financeRows.filter((row) => row.kind === 'operating_cost' && row.createdAt >= new Date(new Date().getFullYear(), 0, 1)).reduce((sum, row) => sum + Number(row.amount), 0)
  return NextResponse.json({ guards: guardRows, incidents: incidentRows, alerts: alertRows, activities: activityRows, kpis: { activeGuards: Number(counts[0]?.active ?? 0), registeredGuards: Number(counts[0]?.total ?? 0), attendanceRate: todayAttendance ? Math.round((todayAttendance / Math.max(Number(counts[0]?.total ?? 1), 1)) * 1000) / 10 : 0, openIncidents: incidentRows.length, unacknowledgedAlerts: alertRows.length, patrolCompletion: todayPatrols.length ? Math.round((todayPatrols.filter((row) => row.withinBounds).length / todayPatrols.length) * 100) : 0, revenueYtd, operatingCostYtd } })
}
