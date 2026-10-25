import { NextResponse } from 'next/server'
import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { alerts, activityEvents, attendance, finances, guards, incidents, patrols } from '@/lib/db/schema'
import { actor, denyGuard } from '@/lib/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'Database is not configured. Add DATABASE_URL to .env.local and restart the app.' }, { status: 503 })
  }
  const currentUser = await actor()
  if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = denyGuard(currentUser)
  if (denied) return denied
  const organizationId = currentUser.organizationId
  const [guardRows, incidentRows, alertRows, activityRows, attendanceRows, counts, patrolRows, financeRows] = await Promise.all([
    db.select().from(guards).where(eq(guards.organizationId, organizationId)).orderBy(desc(guards.lastCheckIn)).limit(8),
    db.select().from(incidents).where(and(eq(incidents.organizationId, organizationId), eq(incidents.status, 'open'))).orderBy(desc(incidents.reportedAt)).limit(5),
    db.select().from(alerts).where(and(eq(alerts.organizationId, organizationId), eq(alerts.acknowledged, false))).orderBy(desc(alerts.createdAt)).limit(5),
    db.select().from(activityEvents).where(eq(activityEvents.organizationId, organizationId)).orderBy(desc(activityEvents.createdAt)).limit(8),
    db.select().from(attendance).where(eq(attendance.organizationId, organizationId)).orderBy(desc(attendance.checkedInAt)).limit(100),
    db.select({ total: sql<number>`count(*)`, active: sql<number>`count(*) filter (where ${guards.status} = 'active')` }).from(guards).where(eq(guards.organizationId, organizationId)),
    db.select().from(patrols).where(eq(patrols.organizationId, organizationId)).orderBy(desc(patrols.loggedAt)).limit(500),
    db.select().from(finances).where(eq(finances.organizationId, organizationId)).limit(500),
  ])
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const todayAttendance = attendanceRows.filter((row) => row.checkedInAt >= today).length
  const todayPatrols = patrolRows.filter((row) => row.loggedAt >= today)
  const revenueYtd = financeRows.filter((row) => row.kind === 'revenue' && row.status === 'paid').reduce((sum, row) => sum + Number(row.amount), 0)
  const operatingCostYtd = financeRows.filter((row) => row.kind === 'operating_cost' && row.createdAt >= new Date(new Date().getFullYear(), 0, 1)).reduce((sum, row) => sum + Number(row.amount), 0)
  return NextResponse.json({ guards: guardRows, incidents: incidentRows, alerts: alertRows, activities: activityRows, kpis: { activeGuards: Number(counts[0]?.active ?? 0), registeredGuards: Number(counts[0]?.total ?? 0), attendanceRate: todayAttendance ? Math.round((todayAttendance / Math.max(Number(counts[0]?.total ?? 1), 1)) * 1000) / 10 : 0, openIncidents: incidentRows.length, unacknowledgedAlerts: alertRows.length, patrolCompletion: todayPatrols.length ? Math.round((todayPatrols.filter((row) => row.withinBounds).length / todayPatrols.length) * 100) : 0, revenueYtd, operatingCostYtd } })
}
