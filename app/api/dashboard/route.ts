import { NextResponse } from 'next/server'
import { desc, eq, sql } from 'drizzle-orm'
import { db, withTenant } from '@/lib/db'
import { alerts, activityEvents, attendance, finances, guards, incidents, patrols } from '@/lib/db/schema'
import { actor, denyGuard } from '@/lib/server'
import { timed } from '@/lib/timing'

export const dynamic = 'force-dynamic'

async function handleGet() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'Database is not configured. Add DATABASE_URL to .env.local and restart the app.' }, { status: 503 })
  }
  const currentUser = await actor()
  if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = denyGuard(currentUser)
  if (denied) return denied
  const organizationId = currentUser.organizationId
  return withTenant(organizationId, async () => {
  const [guardRows, incidentRows, alertRows, activityRows, attendanceRows, counts, patrolRows, financeRows] = await Promise.all([
    db.select().from(guards).orderBy(desc(guards.lastCheckIn)).limit(8),
    db.select().from(incidents).where(eq(incidents.status, 'open')).orderBy(desc(incidents.reportedAt)).limit(5),
    db.select().from(alerts).where(eq(alerts.acknowledged, false)).orderBy(desc(alerts.createdAt)).limit(5),
    db.select().from(activityEvents).orderBy(desc(activityEvents.createdAt)).limit(8),
    db.select().from(attendance).orderBy(desc(attendance.checkedInAt)).limit(100),
    db.select({ total: sql<number>`count(*)`, active: sql<number>`count(*) filter (where ${guards.status} = 'active')` }).from(guards),
    db.select().from(patrols).orderBy(desc(patrols.loggedAt)).limit(500),
    db.select().from(finances).limit(500),
  ])
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const todayAttendance = attendanceRows.filter((row) => row.checkedInAt >= today).length
  const todayPatrols = patrolRows.filter((row) => row.loggedAt >= today)
  const revenueYtd = financeRows.filter((row) => row.kind === 'revenue' && row.status === 'paid').reduce((sum, row) => sum + Number(row.amount), 0)
  const operatingCostYtd = financeRows.filter((row) => row.kind === 'operating_cost' && row.createdAt >= new Date(new Date().getFullYear(), 0, 1)).reduce((sum, row) => sum + Number(row.amount), 0)
  return NextResponse.json({ guards: guardRows, incidents: incidentRows, alerts: alertRows, activities: activityRows, kpis: { activeGuards: Number(counts[0]?.active ?? 0), registeredGuards: Number(counts[0]?.total ?? 0), attendanceRate: todayAttendance ? Math.round((todayAttendance / Math.max(Number(counts[0]?.total ?? 1), 1)) * 1000) / 10 : 0, openIncidents: incidentRows.length, unacknowledgedAlerts: alertRows.length, patrolCompletion: todayPatrols.length ? Math.round((todayPatrols.filter((row) => row.withinBounds).length / todayPatrols.length) * 100) : 0, revenueYtd, operatingCostYtd } })
  })
}

export const GET = timed('/api/dashboard', handleGet)
